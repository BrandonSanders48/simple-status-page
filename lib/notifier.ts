import { eq } from "drizzle-orm";
import type { ServiceTransition } from "./checks/runner";
import { db } from "./db/client";
import { settings, subscriptions } from "./db/schema";
import { isSmtpConfigured, sendMail } from "./mailer";
import { renderStatusChangeEmail } from "./emailTemplates";
import { generateActionTokens } from "./emailTokens";
import { resolvePageUrl } from "./pageUrl";

/**
 * Sends subscriber emails for service status transitions. Called from the periodic
 * background job with the transitions detected by the same check pass that persisted
 * them, so this never re-runs checks itself.
 */
export async function notifyTransitions(transitions: ServiceTransition[]): Promise<void> {
  const toNotify = transitions.filter((t) => t.shouldNotify);
  if (toNotify.length === 0) return;

  const cfg = db.select().from(settings).get();
  if (!isSmtpConfigured(cfg)) {
    console.log("[notifier] SMTP not configured, skipping", toNotify.length, "notification(s)");
    return;
  }

  const url = resolvePageUrl(cfg);

  for (const transition of toNotify) {
    const subs = db
      .select({ email: subscriptions.email })
      .from(subscriptions)
      .where(eq(subscriptions.serviceId, transition.serviceId))
      .all();
    if (subs.length === 0) continue;

    const actionUrls =
      cfg.smtpShowActionButtons && transition.curStatus === "down" && url
        ? generateActionTokens(transition.serviceId, transition.serviceName, url)
        : null;

    const html = renderStatusChangeEmail({
      businessName: cfg.businessName,
      accentColor: cfg.themeAccentColor,
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
