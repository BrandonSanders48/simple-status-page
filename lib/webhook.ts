import { fetch as undiciFetch } from "undici";
import type { settings as SettingsTable } from "./db/schema";

type Settings = typeof SettingsTable.$inferSelect;

export function isWebhookConfigured(cfg: Settings | undefined): cfg is Settings {
  return !!cfg?.webhookEnabled && !!cfg?.webhookUrl;
}

export interface WebhookNotification {
  businessName: string;
  serviceName: string;
  status: "up" | "down";
  linkUrl: string | null;
}

function buildPayload(cfg: Settings, n: WebhookNotification): Record<string, unknown> {
  const emoji = n.status === "down" ? "\u{1F534}" : "\u{1F7E2}";
  const verb = n.status === "down" ? "is DOWN" : "has RECOVERED";
  const suffix = n.linkUrl ? ` — ${n.linkUrl}` : "";

  if (cfg.webhookFormat === "slack") {
    return { text: `${emoji} *${n.serviceName}* ${verb}${suffix}` };
  }
  if (cfg.webhookFormat === "discord") {
    return { content: `${emoji} **${n.serviceName}** ${verb}${suffix}` };
  }
  return {
    service: n.serviceName,
    status: n.status,
    businessName: n.businessName,
    url: n.linkUrl,
    timestamp: new Date().toISOString(),
  };
}

/** Posts a service status-change notification to a Slack/Discord/generic webhook. */
export async function sendWebhookNotification(cfg: Settings, n: WebhookNotification): Promise<void> {
  if (!cfg.webhookUrl) throw new Error("Webhook URL is not configured");
  const res = await undiciFetch(cfg.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(cfg, n)),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Webhook returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
}
