import { eq, inArray } from "drizzle-orm";
import type { ServiceTransition } from "./checks/runner";
import type { SiteTransition } from "./checks/site";
import type { IntegrationTransition } from "./integrationsCache";
import { db } from "./db/client";
import { settings, subscriptions, services, siteSubscriptions, integrationSubscriptions, siteStatus } from "./db/schema";
import { isSmtpConfigured, sendMail } from "./mailer";
import { renderStatusChangeEmail, renderSiteStatusChangeEmail, renderIntegrationStatusChangeEmail } from "./emailTemplates";
import { generateActionTokens } from "./emailTokens";
import { resolvePageUrl } from "./pageUrl";
import { isWebhookConfigured, sendWebhookNotification } from "./webhook";

const EMAIL_ACCENT_COLOR = "#06b6d4";

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
    if (smtpReady) {
      const subs = db
        .select({ email: subscriptions.email })
        .from(subscriptions)
        .where(eq(subscriptions.serviceId, transition.serviceId))
        .all();

      if (subs.length > 0) {
        let suppressEmails = new Set<string>();
        if (transition.curStatus === "down") {
          const svc = db.select({ siteId: services.siteId }).from(services).where(eq(services.id, transition.serviceId)).get();
          const site = svc?.siteId != null ? db.select({ status: siteStatus.status }).from(siteStatus).where(eq(siteStatus.siteId, svc.siteId)).get() : null;
          if (site?.status === "down") {
            const siteSubs = db
              .select({ email: siteSubscriptions.email })
              .from(siteSubscriptions)
              .where(eq(siteSubscriptions.siteId, svc!.siteId!))
              .all();
            suppressEmails = new Set(siteSubs.map((s) => s.email));
          }
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
  }
}

/**
 * Sends subscriber emails and/or a webhook notification when a marketplace
 * integration target's overall health (see lib/integrationsCache.ts) flips between
 * healthy and unhealthy. Recipients are whoever's subscribed directly to that target
 * (integration_subscriptions - see lib/db/schema.ts); unlike services/sites there's
 * no other implicit path into that list (an integration target isn't tied to any
 * particular service or site).
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

  for (const transition of toNotify) {
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
  }
}
