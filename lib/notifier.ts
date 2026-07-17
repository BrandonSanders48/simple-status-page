import { eq } from "drizzle-orm";
import type { ServiceTransition } from "./checks/runner";
import { db } from "./db/client";
import { settings, subscriptions } from "./db/schema";
import { isSmtpConfigured, sendMail } from "./mailer";
import { renderStatusChangeEmail } from "./emailTemplates";
import { generateActionTokens } from "./emailTokens";
import { resolvePageUrl } from "./pageUrl";
import { isWebhookConfigured, sendWebhookNotification } from "./webhook";

const EMAIL_ACCENT_COLOR = "#06b6d4";

/**
 * Sends subscriber emails and/or a webhook (Slack/Discord/generic) notification for
 * service status transitions. Called from the periodic background job with the
 * transitions detected by the same check pass that persisted them, so this never
 * re-runs checks itself. The two channels are independent -- either, both, or neither
 * can be configured.
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

        for (const { email } of subs) {
          try {
            await sendMail(cfg, { to: email, subject, html });
          } catch (err) {
            console.error(`[notifier] failed to email ${email} about ${transition.serviceName}:`, err);
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
