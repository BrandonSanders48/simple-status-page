import nodemailer from "nodemailer";
import type { settings as SettingsTable } from "./db/schema";

type Settings = typeof SettingsTable.$inferSelect;

export function isSmtpConfigured(cfg: Settings | undefined): cfg is Settings {
  return !!cfg?.smtpHost;
}

export function createTransporter(cfg: Settings) {
  return nodemailer.createTransport({
    host: cfg.smtpHost!,
    port: cfg.smtpPort ?? 587,
    secure: cfg.smtpSecure === "ssl",
    ...(cfg.smtpSecure === "none" ? { ignoreTLS: true } : {}),
    auth: cfg.smtpUsername ? { user: cfg.smtpUsername, pass: cfg.smtpPassword ?? "" } : undefined,
  });
}

export async function sendMail(
  cfg: Settings,
  opts: { to: string; subject: string; html: string }
): Promise<void> {
  const transporter = createTransporter(cfg);
  await transporter.sendMail({
    from: cfg.emailFrom || "status@example.com",
    replyTo: cfg.emailReplyTo || cfg.emailFrom || undefined,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
