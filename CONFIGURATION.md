# Configuration Guide

All configuration lives in the SQLite database and is managed entirely through the admin UI at `/admin` (login required unless `require_auth` is disabled). There is no configuration file to hand-edit or mount into the container.

## Table of Contents

1. [General Tab](#general-tab)
2. [Services Tab](#services-tab)
3. [RSS Feeds Tab](#rss-feeds-tab)
4. [Network Tab](#network-tab)
5. [Notifications Tab](#notifications-tab)
6. [SSL Tab](#ssl-tab)
7. [Environment Variables](#environment-variables)

---

## General Tab

**Branding**

| Field | Description |
|---|---|
| Business / Site Name | Display name shown in the navbar and page title |
| Logo | Uploaded image, served from the container's persistent data volume |
| Company URL | Shown in the footer and used as the link in notification emails |
| Support Email / Phone | Shown in the footer |
| Footer Message | Copyright/legal message displayed in the footer |

**Theme Colors** — primary, accent, success, warning, error. Applied via CSS custom properties across the public page.

**SLA Tracking** — enable/disable, uptime target percentage, and reporting period (weekly/monthly/quarterly). When enabled, the navbar shows a real uptime percentage computed from outage history over the selected period (simultaneous outages across multiple services count once, not per-service), colored green when it meets the target and red when it doesn't.

**About / Meta** — description and author shown in the footer, plus a read-only config version that auto-increments on every save.

**Behaviour**
| Field | Description |
|---|---|
| Auto-Refresh Interval | How often the public page polls for updates, in ms (minimum 3000) |
| Require login for admin features | Uncheck to allow `/admin` access without logging in (can also be forced via `APP_AUTH_REQUIRED`) |
| Clear Cache | Forces an immediate refresh of the cached status/RSS data on next request |

---

## Services Tab

Each row: name, host, port, type, description, and a visibility toggle. Reorder with the up/down arrows; order controls display order on the public page. Maximum 20 services.

| Field | Description |
|---|---|
| Port | Leave blank for ICMP ping instead of a port check |
| Type | Free text label, shown on the service card. When it contains "http" or "https" (case-insensitive), the service is checked with a real HTTP request validated by status code, not just a TCP connect, so an app returning server errors is correctly reported as down even if its port still accepts connections. When it contains "dns", the service is checked with a real UDP DNS query instead, since most DNS servers don't listen on TCP at all. Anything else falls back to a raw TCP connect. |
| Show | Whether the service card appears on the public page (down services still count toward the overall status banner even when hidden) |

---

## RSS Feeds Tab

Each row: name, feed URL, format (RSS or Atom), and description. Maximum 10 feeds. The latest item's title is fetched and shown as a card on the public page, color-coded by keyword sentiment (e.g. "outage"/"resolved").

---

## Network Tab

**Connectivity Checks**
| Field | Description |
|---|---|
| Default Gateway | Checked via ICMP ping for the Local-Area status row |
| Public DNS Server | Checked with a real DNS query for the Wide-Area status row |
| Internal Domain | Informational only |

**ISP Detection Map** — maps your public IP address to a friendly ISP name shown alongside the Wide-Area status.

---

## Notifications Tab

**Display & Behaviour** — alert sound and browser notifications on status change (client-side, requires browser permission), plus the announcement banner text and style (`info`, `warning`, `error`) shown on the public page.

**Email / Notifications**
| Field | Description |
|---|---|
| Show quick-action buttons in notification emails | Adds "Work in Progress" / "Mark Resolved" links to down-alert emails that post an incident directly, no login required |
| From / Reply-To Address | |
| SMTP Host / Port / Security / Username / Password | Security is `tls` (STARTTLS), `ssl`, or `none` |
| Send a Test Email | Sends using the currently *saved* SMTP settings — save your changes first |

Notifications are sent automatically by a background job inside the app every 2 minutes; no external cron setup is required. A service found down on its very first check still triggers an alert, not just on a later up→down transition.

---

## SSL Tab

Upload a certificate and private key (PEM). Both are validated together before being accepted, and applied to the running HTTPS listener immediately when possible, or on next restart otherwise. Files are stored on the container's persistent data volume (`/data/ssl`); a self-signed certificate is generated automatically on first boot if none is uploaded.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `APP_USERNAME` | `admin` | Admin login username |
| `APP_PASSWORD` | `changeme` | Admin login password |
| `APP_AUTH_REQUIRED` | `true` | Set `false` to disable the login requirement entirely (overrides the in-app toggle) |
| `AUTH_SECRET` | *(required)* | Random secret used to sign session cookies. Generate with `openssl rand -hex 32` |
| `PAGE_URL` | *(company URL setting)* | Public base URL used to build links in notification emails |
| `DATA_DIR` | `/data` in Docker, `./data` locally | Where the SQLite database, uploads, and SSL certs are stored |
| `PORT` | `3000` | HTTP listener port |
| `HTTPS_PORT` | `3443` | HTTPS listener port (only starts once a certificate is present) |

### Docker Example

```bash
docker run -d \
  -e APP_USERNAME="admin" \
  -e APP_PASSWORD="secure-password" \
  -e AUTH_SECRET="$(openssl rand -hex 32)" \
  -p 80:3000 -p 443:3443 \
  -v simple-status-page-data:/data \
  brandonsanders/simple-status-page
```

---

## Popular Status Page RSS URLs

- **Atlassian**: `https://status.atlassian.com/history.rss`
- **GitHub**: `https://www.githubstatus.com/history.rss`
- **AWS**: `https://status.aws.amazon.com/rss/all.rss`
- **Google Cloud**: `https://status.cloud.google.com/incidents.rss`

## Tips

1. **Keep it simple** — only configure the services and feeds you actually need
2. **Use HTTPS URLs** for external RSS feeds and logo sources where possible
3. **Set `AUTH_SECRET`** in production — the app will refuse to start sessions without it
4. **Back up `/data`** — it holds the entire database, uploaded logo, and SSL certs as a single volume
5. **Test SMTP with the Send Test button** before relying on real outage alerts
