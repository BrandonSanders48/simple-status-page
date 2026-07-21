function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(inner: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9;">
    <tr><td style="padding:40px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08),0 8px 30px rgba(0,0,0,0.04);">
        ${inner}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderTestEmail(opts: { businessName: string; from: string; to: string; linkUrl?: string | null }): string {
  const { businessName, from, to, linkUrl } = opts;
  const cta = linkUrl
    ? `<tr><td style="padding:24px 32px 0;text-align:center;">
        <a href="${escapeHtml(linkUrl)}" target="_blank" style="display:inline-block;padding:12px 32px;background:#06b6d4;color:#ffffff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">View Status Page</a>
      </td></tr>`
    : "";

  return shell(`
    <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #f1f5f9;">
      <span style="font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(businessName)}</span>
    </td></tr>
    <tr><td style="padding:24px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;">
        <tr><td style="padding:20px 24px;text-align:center;">
          <div style="font-size:36px;line-height:1;margin-bottom:10px;">&#9989;</div>
          <div style="font-size:20px;font-weight:700;color:#0f172a;margin-bottom:4px;">Email Working</div>
          <div style="font-size:14px;font-weight:600;color:#059669;">SMTP configuration is correct</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:24px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border-radius:10px;">
        <tr><td style="padding:14px 20px;font-size:13px;color:#64748b;">From</td><td style="padding:14px 20px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">${escapeHtml(from)}</td></tr>
        <tr><td style="padding:0 20px 14px;font-size:13px;color:#64748b;">To</td><td style="padding:0 20px 14px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">${escapeHtml(to)}</td></tr>
        <tr><td style="padding:0 20px 14px;font-size:13px;color:#64748b;">Sent at</td><td style="padding:0 20px 14px;font-size:13px;color:#334155;text-align:right;">${new Date().toLocaleString()}</td></tr>
      </table>
    </td></tr>
    ${cta}
    <tr><td style="padding:28px 32px;text-align:center;border-top:1px solid #f1f5f9;margin-top:24px;">
      <span style="font-size:12px;color:#94a3b8;">${escapeHtml(businessName)}</span>
    </td></tr>
  `);
}

export function renderStatusChangeEmail(opts: {
  businessName: string;
  accentColor: string;
  serviceName: string;
  status: "up" | "down";
  linkUrl?: string | null;
  actionUrls?: { wip: string; resolved: string } | null;
}): string {
  const { businessName, accentColor, serviceName, status, linkUrl, actionUrls } = opts;
  const isUp = status === "up";
  const statusLabel = isUp ? "Operational" : "Down";
  const statusIcon = isUp ? "&#9989;" : "&#128721;";
  const pillBg = isUp ? "#ecfdf5" : "#fef2f2";
  const pillColor = isUp ? "#059669" : "#dc2626";
  const bannerBg = isUp ? "#f0fdf4" : "#fef2f2";
  const bannerBorder = isUp ? "#bbf7d0" : "#fecaca";

  const actionButtons = !isUp && actionUrls
    ? `<tr><td style="padding:0 32px;">
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid #f1f5f9;">
          <p style="font-size:12px;color:#94a3b8;margin:0 0 14px;text-align:center;font-weight:500;">Quick actions</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              <td style="padding-right:10px;"><a href="${escapeHtml(actionUrls.wip)}" style="display:inline-block;padding:10px 22px;background:#fef3c7;color:#92400e;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px;">Work in Progress</a></td>
              <td><a href="${escapeHtml(actionUrls.resolved)}" style="display:inline-block;padding:10px 22px;background:#d1fae5;color:#065f46;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px;">Mark Resolved</a></td>
            </tr>
          </table>
          <p style="font-size:11px;color:#cbd5e1;margin:12px 0 0;text-align:center;">Links expire in 48 hours</p>
        </div>
      </td></tr>`
    : "";

  const cta = linkUrl
    ? `<tr><td style="padding:24px 32px 0;text-align:center;">
        <a href="${escapeHtml(linkUrl)}" target="_blank" style="display:inline-block;padding:12px 32px;background:${accentColor};color:#ffffff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">View Status Page</a>
      </td></tr>`
    : "";

  return shell(`
    <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #f1f5f9;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="vertical-align:middle;"><span style="font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(businessName)}</span></td>
        <td style="vertical-align:middle;text-align:right;">
          <span style="display:inline-block;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;background:${pillBg};color:${pillColor};">${statusLabel}</span>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:24px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${bannerBg};border:1px solid ${bannerBorder};border-radius:12px;">
        <tr><td style="padding:20px 24px;text-align:center;">
          <div style="font-size:36px;line-height:1;margin-bottom:10px;">${statusIcon}</div>
          <div style="font-size:20px;font-weight:700;color:#0f172a;margin-bottom:4px;">${escapeHtml(serviceName)}</div>
          <div style="font-size:14px;font-weight:600;color:${pillColor};">Service is ${statusLabel.toLowerCase()}</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:24px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border-radius:10px;">
        <tr><td style="padding:14px 20px;font-size:13px;color:#64748b;">Service</td><td style="padding:14px 20px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">${escapeHtml(serviceName)}</td></tr>
        <tr><td style="padding:0 20px 14px;font-size:13px;color:#64748b;">Status</td><td style="padding:0 20px 14px;font-size:13px;font-weight:600;color:${pillColor};text-align:right;">${statusLabel.toUpperCase()}</td></tr>
        <tr><td style="padding:0 20px 14px;font-size:13px;color:#64748b;">Checked at</td><td style="padding:0 20px 14px;font-size:13px;color:#334155;text-align:right;">${new Date().toLocaleString()}</td></tr>
      </table>
    </td></tr>
    ${cta}
    ${actionButtons}
    <tr><td style="padding:28px 32px;text-align:center;border-top:1px solid #f1f5f9;margin-top:24px;">
      <span style="font-size:12px;color:#94a3b8;">${escapeHtml(businessName)}</span>
    </td></tr>
  `);
}

/** Same shape as renderStatusChangeEmail, but for a site's own tunnel check (see
 * lib/checks/site.ts) rather than a single service - lists the services grouped
 * under that site so the reader knows what's affected, and (when down) explicitly
 * calls out that those services may still be reachable locally from within the site,
 * since this alert is about the link to the site, not the services behind it. */
export function renderSiteStatusChangeEmail(opts: {
  businessName: string;
  accentColor: string;
  siteName: string;
  status: "up" | "down";
  linkUrl?: string | null;
  serviceNames: string[];
}): string {
  const { businessName, accentColor, siteName, status, linkUrl, serviceNames } = opts;
  const isUp = status === "up";
  const statusLabel = isUp ? "Operational" : "Down";
  const statusIcon = isUp ? "&#9989;" : "&#128721;";
  const pillBg = isUp ? "#ecfdf5" : "#fef2f2";
  const pillColor = isUp ? "#059669" : "#dc2626";
  const bannerBg = isUp ? "#f0fdf4" : "#fef2f2";
  const bannerBorder = isUp ? "#bbf7d0" : "#fecaca";

  const servicesList =
    serviceNames.length > 0
      ? `<tr><td style="padding:24px 32px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border-radius:10px;">
            <tr><td style="padding:14px 20px 6px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.03em;">Services at this site</td></tr>
            <tr><td style="padding:0 20px 16px;font-size:13px;color:#334155;line-height:1.7;">${serviceNames.map(escapeHtml).join(", ")}</td></tr>
          </table>
        </td></tr>`
      : "";

  const downNote = !isUp
    ? `<tr><td style="padding:16px 32px 0;">
        <p style="font-size:12.5px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;margin:0;line-height:1.6;">
          This alert is about the link/tunnel to this site, not the services themselves${
            serviceNames.length > 0 ? " - the services above" : ""
          } may still be available locally from within the site even while this is down.
        </p>
      </td></tr>`
    : "";

  const cta = linkUrl
    ? `<tr><td style="padding:24px 32px 0;text-align:center;">
        <a href="${escapeHtml(linkUrl)}" target="_blank" style="display:inline-block;padding:12px 32px;background:${accentColor};color:#ffffff;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">View Status Page</a>
      </td></tr>`
    : "";

  return shell(`
    <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #f1f5f9;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="vertical-align:middle;"><span style="font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(businessName)}</span></td>
        <td style="vertical-align:middle;text-align:right;">
          <span style="display:inline-block;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;background:${pillBg};color:${pillColor};">${statusLabel}</span>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:24px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${bannerBg};border:1px solid ${bannerBorder};border-radius:12px;">
        <tr><td style="padding:20px 24px;text-align:center;">
          <div style="font-size:36px;line-height:1;margin-bottom:10px;">${statusIcon}</div>
          <div style="font-size:20px;font-weight:700;color:#0f172a;margin-bottom:4px;">${escapeHtml(siteName)}</div>
          <div style="font-size:14px;font-weight:600;color:${pillColor};">Site tunnel is ${statusLabel.toLowerCase()}</div>
        </td></tr>
      </table>
    </td></tr>
    ${servicesList}
    ${downNote}
    <tr><td style="padding:24px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border-radius:10px;">
        <tr><td style="padding:14px 20px;font-size:13px;color:#64748b;">Site</td><td style="padding:14px 20px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">${escapeHtml(siteName)}</td></tr>
        <tr><td style="padding:0 20px 14px;font-size:13px;color:#64748b;">Status</td><td style="padding:0 20px 14px;font-size:13px;font-weight:600;color:${pillColor};text-align:right;">${statusLabel.toUpperCase()}</td></tr>
        <tr><td style="padding:0 20px 14px;font-size:13px;color:#64748b;">Checked at</td><td style="padding:0 20px 14px;font-size:13px;color:#334155;text-align:right;">${new Date().toLocaleString()}</td></tr>
      </table>
    </td></tr>
    ${cta}
    <tr><td style="padding:28px 32px;text-align:center;border-top:1px solid #f1f5f9;margin-top:24px;">
      <span style="font-size:12px;color:#94a3b8;">${escapeHtml(businessName)}</span>
    </td></tr>
  `);
}
