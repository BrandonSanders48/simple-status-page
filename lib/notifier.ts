import { eq, and, inArray } from "drizzle-orm";
import type { ServiceTransition } from "./checks/runner";
import type { SiteTransition } from "./checks/site";
import type { IntegrationTransition } from "./integrationsCache";
import { db } from "./db/client";
import {
  settings,
  subscriptions,
  services,
  siteSubscriptions,
  integrationSubscriptions,
  siteStatus,
  integrationTargets,
  phoneSubscriptions,
  sitePhoneSubscriptions,
  integrationPhoneSubscriptions,
} from "./db/schema";
import { isSmtpConfigured, sendMail } from "./mailer";
import {
  renderStatusChangeEmail,
  renderSiteStatusChangeEmail,
  renderIntegrationStatusChangeEmail,
  renderWanDownIntegrationsEmail,
} from "./emailTemplates";
import { generateActionTokens } from "./emailTokens";
import { resolvePageUrl } from "./pageUrl";
import { isWebhookConfigured, sendWebhookNotification } from "./webhook";
import { checkDns } from "./checks/dns";
import { parseIntegrationConfig } from "./integrationTargets";
import { sendGotoConnectSms } from "./integrations/gotoConnect";

const EMAIL_ACCENT_COLOR = "#06b6d4";

/**
 * Sends a plain-text SMS via every enabled GoTo Connect integration target that has
 * smsFromNumber configured (see lib/integrationCatalogMeta.ts) - an additional
 * outbound notification channel alongside subscriber email and the Slack/Discord/
 * generic webhook, triggered by the exact same events as the webhook. Texts every
 * number in `subscriberPhones` (phone subscribers relevant to this transition - see
 * phoneSubscriptions/sitePhoneSubscriptions/integrationPhoneSubscriptions in
 * lib/db/schema.ts) plus that target's own fixed smsToNumber, if set - the same
 * admin-configured "always notify this number" field used before phone subscriptions
 * existed. If more than one GoTo Connect target has a From number configured, every
 * one of them sends its own text (and a number could receive more than one if it's
 * both a subscriber and set as a fixed number, or if multiple targets are configured
 * - not deduplicated across targets, matching the equivalent multi-target behavior
 * for the fixed number alone before this).
 */
async function sendGotoSms(subscriberPhones: string[], message: string): Promise<void> {
  const gotoTargets = db
    .select()
    .from(integrationTargets)
    .where(and(eq(integrationTargets.integration, "goto_connect"), eq(integrationTargets.enabled, true)))
    .all();

  for (const target of gotoTargets) {
    const config = parseIntegrationConfig(target.config);
    if (!config.smsFromNumber) continue;

    const toNumbers = new Set(subscriberPhones);
    if (config.smsToNumber) toNumbers.add(config.smsToNumber);

    for (const toNumber of toNumbers) {
      try {
        const result = await sendGotoConnectSms(config, toNumber, message);
        if (!result.ok) console.error(`[notifier] failed to send GoTo SMS to ${toNumber} via "${target.name}":`, result.error);
      } catch (err) {
        console.error(`[notifier] failed to send GoTo SMS to ${toNumber} via "${target.name}":`, err);
      }
    }
  }
}

/**
 * Sends subscriber emails and/or a webhook (Slack/Discord/generic) notification for
 * service status transitions. Called from the periodic background job with the
 * transitions detected by the same check pass that persisted them, so this never
 * re-runs checks itself. The two channels are independent - either, both, or neither
 * can be configured.
 *
 * A subscriber who's also directly subscribed to this service's site (see
 * lib/db/schema.ts's siteSubscriptions) does NOT get this email if that site's own
 * tunnel is currently down - they're already getting the site-down email (which
 * names this service), and when a site's tunnel is down its services usually go
 * down too as a direct symptom of the same outage, not a separate problem worth a
 * second email. A subscriber who only subscribed to the service (not the site)
 * still gets it, since they may have no idea the site concept exists.
 */
export async function notifyTransitions(transitions: ServiceTransition[]): Promise<void> {
  const toNotify = transitions.filter((t) => t.shouldNotify);
  if (toNotify.length === 0) return;

  const cfg = db.select().from(settings).get();
  const url = cfg ? resolvePageUrl(cfg) : null;

  const smtpReady = isSmtpConfigured(cfg);
  const webhookReady = isWebhookConfigured(cfg);
  if (!smtpReady && !webhookReady) {
    console.log("[notifier] no notification channel configured, skipping", toNotify.length, "notification(s)");
    return;
  }

  for (const transition of toNotify) {
    // Computed once and reused for both email and SMS suppression below: a subscriber
    // to this service is skipped on the channel they're ALSO subscribed to this
    // service's site on, if that site's tunnel is currently down (see this
    // function's doc comment).
    let siteId: number | null = null;
    let siteIsDown = false;
    if (transition.curStatus === "down") {
      const svc = db.select({ siteId: services.siteId }).from(services).where(eq(services.id, transition.serviceId)).get();
      siteId = svc?.siteId ?? null;
      if (siteId != null) {
        const site = db.select({ status: siteStatus.status }).from(siteStatus).where(eq(siteStatus.siteId, siteId)).get();
        siteIsDown = site?.status === "down";
      }
    }

    if (smtpReady) {
      const subs = db
        .select({ email: subscriptions.email })
        .from(subscriptions)
        .where(eq(subscriptions.serviceId, transition.serviceId))
        .all();

      if (subs.length > 0) {
        let suppressEmails = new Set<string>();
        if (siteIsDown && siteId != null) {
          const siteSubs = db.select({ email: siteSubscriptions.email }).from(siteSubscriptions).where(eq(siteSubscriptions.siteId, siteId)).all();
          suppressEmails = new Set(siteSubs.map((s) => s.email));
        }

        const recipients = subs.filter((s) => !suppressEmails.has(s.email));

        if (recipients.length > 0) {
          const actionUrls =
            cfg.smtpShowActionButtons && transition.curStatus === "down" && url
              ? generateActionTokens(transition.serviceId, transition.serviceName, url)
              : null;

          const html = renderStatusChangeEmail({
            businessName: cfg.businessName,
            accentColor: EMAIL_ACCENT_COLOR,
            serviceName: transition.serviceName,
            status: transition.curStatus,
            linkUrl: url,
            actionUrls,
          });

          const subject = `Service '${transition.serviceName}' is now ${transition.curStatus.toUpperCase()}`;

          for (const { email } of recipients) {
            try {
              await sendMail(cfg, { to: email, subject, html });
            } catch (err) {
              console.error(`[notifier] failed to email ${email} about ${transition.serviceName}:`, err);
            }
          }
        }
      }
    }

    if (webhookReady) {
      try {
        await sendWebhookNotification(cfg, {
          businessName: cfg.businessName,
          serviceName: transition.serviceName,
          status: transition.curStatus,
          linkUrl: url,
        });
      } catch (err) {
        console.error(`[notifier] failed to post webhook for ${transition.serviceName}:`, err);
      }
    }

    const phoneSubs = db.select({ phone: phoneSubscriptions.phone }).from(phoneSubscriptions).where(eq(phoneSubscriptions.serviceId, transition.serviceId)).all();
    let suppressPhones = new Set<string>();
    if (siteIsDown && siteId != null) {
      const sitePhoneSubs = db.select({ phone: sitePhoneSubscriptions.phone }).from(sitePhoneSubscriptions).where(eq(sitePhoneSubscriptions.siteId, siteId)).all();
      suppressPhones = new Set(sitePhoneSubs.map((s) => s.phone));
    }
    const phoneRecipients = phoneSubs.map((s) => s.phone).filter((p) => !suppressPhones.has(p));

    await sendGotoSms(
      phoneRecipients,
      `${cfg.businessName}: ${transition.serviceName} is ${transition.curStatus === "down" ? "DOWN" : "back UP"}${url ? ` - ${url}` : ""}`
    );
  }
}

/**
 * Sends subscriber emails and/or a webhook notification when a site's own tunnel
 * check (see lib/checks/site.ts) changes status. Recipients are the union of anyone
 * subscribed directly to the site (site_subscriptions - see lib/db/schema.ts) and
 * anyone subscribed to any service assigned to it, since either implies caring about
 * that site's link. The email lists the site's services and (when down) explicitly
 * notes they may still be reachable locally at the site, since this alert is about
 * the link to the site, not the services behind it.
 */
export async function notifySiteTransitions(transitions: SiteTransition[]): Promise<void> {
  const toNotify = transitions.filter((t) => t.shouldNotify);
  if (toNotify.length === 0) return;

  const cfg = db.select().from(settings).get();
  const url = cfg ? resolvePageUrl(cfg) : null;

  const smtpReady = isSmtpConfigured(cfg);
  const webhookReady = isWebhookConfigured(cfg);
  if (!smtpReady && !webhookReady) {
    console.log("[notifier] no notification channel configured, skipping", toNotify.length, "site notification(s)");
    return;
  }

  for (const transition of toNotify) {
    const siteServices = db.select({ id: services.id, name: services.name }).from(services).where(eq(services.siteId, transition.siteId)).all();

    if (smtpReady) {
      const serviceIds = siteServices.map((s) => s.id);
      const serviceSubRows =
        serviceIds.length > 0
          ? db.select({ email: subscriptions.email }).from(subscriptions).where(inArray(subscriptions.serviceId, serviceIds)).all()
          : [];
      const siteSubRows = db.select({ email: siteSubscriptions.email }).from(siteSubscriptions).where(eq(siteSubscriptions.siteId, transition.siteId)).all();
      const uniqueEmails = [...new Set([...serviceSubRows, ...siteSubRows].map((r) => r.email))];

      if (uniqueEmails.length > 0) {
        const html = renderSiteStatusChangeEmail({
          businessName: cfg.businessName,
          accentColor: EMAIL_ACCENT_COLOR,
          siteName: transition.siteName,
          status: transition.curStatus,
          linkUrl: url,
          serviceNames: siteServices.map((s) => s.name),
        });

        const subject = `Site '${transition.siteName}' tunnel is now ${transition.curStatus.toUpperCase()}`;

        for (const email of uniqueEmails) {
          try {
            await sendMail(cfg, { to: email, subject, html });
          } catch (err) {
            console.error(`[notifier] failed to email ${email} about site ${transition.siteName}:`, err);
          }
        }
      }
    }

    if (webhookReady) {
      try {
        await sendWebhookNotification(cfg, {
          businessName: cfg.businessName,
          serviceName: `Site: ${transition.siteName}`,
          status: transition.curStatus,
          linkUrl: url,
        });
      } catch (err) {
        console.error(`[notifier] failed to post webhook for site ${transition.siteName}:`, err);
      }
    }

    const serviceIds = siteServices.map((s) => s.id);
    const servicePhoneSubRows =
      serviceIds.length > 0 ? db.select({ phone: phoneSubscriptions.phone }).from(phoneSubscriptions).where(inArray(phoneSubscriptions.serviceId, serviceIds)).all() : [];
    const sitePhoneSubRows = db
      .select({ phone: sitePhoneSubscriptions.phone })
      .from(sitePhoneSubscriptions)
      .where(eq(sitePhoneSubscriptions.siteId, transition.siteId))
      .all();
    const uniquePhones = [...new Set([...servicePhoneSubRows, ...sitePhoneSubRows].map((r) => r.phone))];

    await sendGotoSms(
      uniquePhones,
      `${cfg.businessName}: Site ${transition.siteName} tunnel is ${transition.curStatus === "down" ? "DOWN" : "back UP"}${url ? ` - ${url}` : ""}`
    );
  }
}

/**
 * Sends subscriber emails and/or a webhook notification when a marketplace
 * integration target's overall health (see lib/integrationsCache.ts) flips between
 * healthy and unhealthy. Recipients are whoever's subscribed directly to that target
 * (integration_subscriptions - see lib/db/schema.ts); unlike services/sites there's
 * no other implicit path into that list (an integration target isn't tied to any
 * particular service or site).
 *
 * If the Wide-Area network itself is down at the same moment, most internet-
 * dependent integrations tend to go unhealthy together as one symptom of that single
 * outage - rather than a separate email/webhook post per integration in that case,
 * every DOWN transition this cycle is consolidated into one "WAN appears down" email
 * per affected subscriber (and one webhook post) naming all of them (see
 * renderWanDownIntegrationsEmail). Recovery transitions, and any DOWN transition
 * while the WAN checks out fine, still notify individually as before. WAN status is
 * checked fresh here (a single DNS query) rather than read from the public status
 * page's own cache, since this runs on its own schedule independent of that cache.
 */
export async function notifyIntegrationTransitions(transitions: IntegrationTransition[]): Promise<void> {
  const toNotify = transitions.filter((t) => t.shouldNotify);
  if (toNotify.length === 0) return;

  const cfg = db.select().from(settings).get();
  const url = cfg ? resolvePageUrl(cfg) : null;

  const smtpReady = isSmtpConfigured(cfg);
  const webhookReady = isWebhookConfigured(cfg);
  if (!smtpReady && !webhookReady) {
    console.log("[notifier] no notification channel configured, skipping", toNotify.length, "integration notification(s)");
    return;
  }

  const downTransitions = toNotify.filter((t) => !t.curHealthy);
  const wanDown = downTransitions.length > 0 && !!cfg.publicDnsHost && !(await checkDns(cfg.publicDnsHost, 53));

  if (wanDown) {
    if (smtpReady) {
      const targetIds = downTransitions.map((t) => t.targetId);
      const subRows = db
        .select({ email: integrationSubscriptions.email, targetId: integrationSubscriptions.targetId })
        .from(integrationSubscriptions)
        .where(inArray(integrationSubscriptions.targetId, targetIds))
        .all();

      const targetNamesByEmail = new Map<string, string[]>();
      for (const row of subRows) {
        const targetName = downTransitions.find((t) => t.targetId === row.targetId)?.targetName;
        if (!targetName) continue;
        const list = targetNamesByEmail.get(row.email) ?? [];
        list.push(targetName);
        targetNamesByEmail.set(row.email, list);
      }

      for (const [email, targetNames] of targetNamesByEmail) {
        const html = renderWanDownIntegrationsEmail({ businessName: cfg.businessName, accentColor: EMAIL_ACCENT_COLOR, linkUrl: url, targetNames });
        const subject = `${targetNames.length} integration${targetNames.length === 1 ? "" : "s"} affected (WAN appears down)`;
        try {
          await sendMail(cfg, { to: email, subject, html });
        } catch (err) {
          console.error(`[notifier] failed to email ${email} about WAN-down integrations:`, err);
        }
      }
    }

    if (webhookReady) {
      try {
        await sendWebhookNotification(cfg, {
          businessName: cfg.businessName,
          serviceName: `WAN outage - ${downTransitions.length} integration${downTransitions.length === 1 ? "" : "s"} affected (${downTransitions.map((t) => t.targetName).join(", ")})`,
          status: "down",
          linkUrl: url,
        });
      } catch (err) {
        console.error("[notifier] failed to post consolidated WAN-down webhook:", err);
      }
    }

    const wanDownTargetIds = downTransitions.map((t) => t.targetId);
    const wanDownPhoneRows = db
      .select({ phone: integrationPhoneSubscriptions.phone })
      .from(integrationPhoneSubscriptions)
      .where(inArray(integrationPhoneSubscriptions.targetId, wanDownTargetIds))
      .all();
    const wanDownPhones = [...new Set(wanDownPhoneRows.map((r) => r.phone))];

    await sendGotoSms(
      wanDownPhones,
      `${cfg.businessName}: WAN outage - ${downTransitions.length} integration${downTransitions.length === 1 ? "" : "s"} affected: ${downTransitions.map((t) => t.targetName).join(", ")}${url ? ` - ${url}` : ""}`
    );
  }

  // Recovery transitions always notify individually (a WAN outage doesn't explain an
  // integration recovering); DOWN transitions only fall through here when the WAN
  // check above didn't find it down, so they still get their own per-integration
  // message the normal way.
  const individually = wanDown ? toNotify.filter((t) => t.curHealthy) : toNotify;

  for (const transition of individually) {
    if (smtpReady) {
      const subs = db
        .select({ email: integrationSubscriptions.email })
        .from(integrationSubscriptions)
        .where(eq(integrationSubscriptions.targetId, transition.targetId))
        .all();

      if (subs.length > 0) {
        const html = renderIntegrationStatusChangeEmail({
          businessName: cfg.businessName,
          accentColor: EMAIL_ACCENT_COLOR,
          targetName: transition.targetName,
          status: transition.curHealthy ? "up" : "down",
          linkUrl: url,
          summary: transition.summary,
        });

        const subject = `Integration '${transition.targetName}' is now ${transition.curHealthy ? "HEALTHY" : "UNHEALTHY"}`;

        for (const { email } of subs) {
          try {
            await sendMail(cfg, { to: email, subject, html });
          } catch (err) {
            console.error(`[notifier] failed to email ${email} about integration ${transition.targetName}:`, err);
          }
        }
      }
    }

    if (webhookReady) {
      try {
        await sendWebhookNotification(cfg, {
          businessName: cfg.businessName,
          serviceName: `Integration: ${transition.targetName}`,
          status: transition.curHealthy ? "up" : "down",
          linkUrl: url,
        });
      } catch (err) {
        console.error(`[notifier] failed to post webhook for integration ${transition.targetName}:`, err);
      }
    }

    const phoneSubs = db
      .select({ phone: integrationPhoneSubscriptions.phone })
      .from(integrationPhoneSubscriptions)
      .where(eq(integrationPhoneSubscriptions.targetId, transition.targetId))
      .all();

    await sendGotoSms(
      phoneSubs.map((s) => s.phone),
      `${cfg.businessName}: Integration ${transition.targetName} is ${transition.curHealthy ? "HEALTHY" : "UNHEALTHY"}${url ? ` - ${url}` : ""}`
    );
  }
}
