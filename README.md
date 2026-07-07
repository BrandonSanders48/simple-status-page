# Simple Status Page

A sleek, production-ready status page built with PHP, Tailwind CSS, and vanilla JS. Real-time service monitoring, incident management, outage history, email subscriptions, RSS feed integration, and full branding customization, no database required.

## Screenshot

![Simple Status Page](images/screenshot.png)

## Features

**Monitoring**
- Real-time checks for internal services: real HTTP(S) requests (status-code validated) for services typed HTTP/HTTPS, raw TCP port checks for everything else, and ICMP ping when no port is set
- Parallel checks via `curl_multi` for fast results
- Local-area (gateway) and wide-area (public DNS) network status
- Live pulsing **LIVE** indicator on the status banner
- Service cards don't re-render unless status actually changes (no flicker on refresh)

**Service Cards**
- Hover tooltip shows hostname, port number, last offline time, and outage duration
- Live downtime counter on any card that is currently down (counts up in real time)
- Automatic downtime tracking, no cron job required

**Outage History**
- Full log of every down→up cycle with service name, went-down time, recovered time, and duration
- Filter by service name
- Filter by time range: last hour, 8 hours, 24 hours, 7 days, 30 days

**Incident Management**
- Create incidents with title, description, severity, start time, and optional end time
- Severity levels: Degraded / Outage / Maintenance / Resolved
- Ongoing badge for incidents without an end time
- Admin-only create/remove; visible to all

**Notifications**
- Email subscriptions, users subscribe per service, with self-service manage/unsubscribe modals
- SMTP notifications via PHPMailer when a service changes state, including a service found down on its very first check
- One-click "Work in Progress" / "Mark Resolved" action links in outage emails that post an incident directly (no login needed)
- Optional browser push notifications and alert sound on status change
- Test Email button in Settings to verify SMTP configuration

**Configuration (UI)**
- In-browser config editor with tabs: General, Services, RSS Feeds, Network, Notifications, SSL
- Drag-and-drop row reordering for services and RSS feeds
- Live row counter with caps: 20 services max, 10 RSS feeds max
- One-click config backup download
- Self-signed certificate generation plus custom certificate upload
- Theme color pickers, announcement banner, SLA target badge (displayed value, not yet computed from live outage history)

**Other**
- RSS / Atom feed integration (displays latest item from external status feeds)
- Dark mode (cookie-persisted, toggle in navbar)
- Fully responsive: mobile, tablet, desktop
- CSRF protection on all forms
- Rate limiting on login (5 attempts / 5 min) and incident creation (10 / 10 min)
- Docker ready

## Default Login

**Username:** `admin`  
**Password:** `changeme`

Set via environment variables or change in `include/configuration.json`.

## Quick Start

### Option 1: Docker (recommended)

```bash
docker run -d \
  --name simple-status-page \
  -p 8080:80 \
  -e APP_USERNAME="admin" \
  -e APP_PASSWORD="changeme" \
  -e APP_AUTH_REQUIRED="true" \
  brandonsanders/simple-status-page
```

Open [http://localhost:8080](http://localhost:8080).

### Option 2: Build from source

```bash
git clone https://github.com/BrandonSanders48/simple-status-page.git
cd simple-status-page
docker build -t simple-status-page .
docker run -d -p 8080:80 \
  -e APP_USERNAME="admin" \
  -e APP_PASSWORD="changeme" \
  simple-status-page
```

### Option 3: Plain PHP

```bash
php -S localhost:8080
```

Requires PHP 8.0+ with `curl` and `exec` available.

## Configuration

Everything is configurable both ways: through the in-browser UI at `/config.php`, or by editing `include/configuration.json` directly.

### Services

Add each service with a name, host, port, type, and description. Set `port` to `null` for ICMP ping instead of a port check. When `type` mentions "http" or "https" (case-insensitive), the service gets a real HTTP request with status-code validation instead of a raw TCP connect, so an app returning server errors is correctly reported as down even if its port still accepts connections. Maximum 20 services.

### RSS Feeds

Add a feed with a name, URL, tag, and description. `tag` is `"item"` for RSS or `"entry"` for Atom. Maximum 10 feeds.

### Branding & Theme

Set business name, logo, company URL, support email, footer message, announcement banner, and theme colors (primary, accent, success, warning, error).

### Email Notifications (SMTP)

Set the from/reply-to addresses and SMTP host, port, security mode, username, and password. To send notifications on status change, run `include/cron/status_check_and_notify.php` on a cron schedule. The main status page tracks downtime automatically without cron.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `APP_USERNAME` | `admin` | Admin login username |
| `APP_PASSWORD` | `changeme` | Admin login password |
| `APP_AUTH_REQUIRED` | `true` | Set `false` to disable login requirement |
