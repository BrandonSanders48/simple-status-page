# Simple Status Page

A sleek, production-ready status page built with PHP, Tailwind CSS, and vanilla JS. Real-time service monitoring, incident management, outage history, email subscriptions, RSS feed integration, and full branding customization — no database required.

## Screenshot

![Simple Status Page](images/screenshot.png)

## Features

**Monitoring**
- Real-time TCP port and ICMP ping checks for internal services
- Parallel checks via `curl_multi` for fast results
- Local-area (gateway) and wide-area (public DNS) network status
- Live pulsing **LIVE** indicator on the status banner
- Service cards don't re-render unless status actually changes (no flicker on refresh)

**Service Cards**
- Hover tooltip shows hostname, port number, last offline time, and outage duration
- Live downtime counter on any card that is currently down (counts up in real time)
- Automatic downtime tracking — no cron job required

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
- Email subscriptions — users subscribe per service
- SMTP notifications via PHPMailer when a service changes state
- Optional browser push notifications and alert sound on status change

**Configuration (UI)**
- In-browser config editor with tabs: General, Services, RSS Feeds, Network, Notifications
- Drag-and-drop row reordering for services and RSS feeds
- Live row counter with caps: 20 services max, 10 RSS feeds max
- One-click config backup download
- Theme color pickers, announcement banner, SLA settings

**Other**
- RSS / Atom feed integration (displays latest item from external status feeds)
- Multi-language: English / Español
- Dark mode (cookie-persisted, toggle in navbar)
- Fully responsive — mobile, tablet, desktop
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

All settings live in `include/configuration.json` and can be edited through the in-browser UI at `/config.php`.

### Services

```json
{
  "internal_hosts": [
    {
      "name": "Web Server",
      "host": "192.168.1.10",
      "port": 443,
      "type": "HTTPS",
      "description": "Main web server"
    },
    {
      "name": "Gateway",
      "host": "192.168.1.1",
      "port": null,
      "type": "PING",
      "description": "Default gateway — ICMP ping (port null)"
    }
  ]
}
```

Set `port` to `null` for ICMP ping instead of a TCP check. Maximum 20 services.

### RSS Feeds

```json
{
  "RSS": [
    {
      "name": "AWS",
      "host": "https://status.aws.amazon.com/rss/all.rss",
      "tag": "item",
      "description": "AWS service health"
    }
  ]
}
```

`tag` is `"item"` for RSS or `"entry"` for Atom. Maximum 10 feeds.

### Branding & Theme

```json
{
  "branding": {
    "business_name": "Your Company",
    "business_logo": "images/logo.webp",
    "company_url": "https://example.com",
    "support_email": "support@example.com",
    "footer_message": "© 2026 Your Company",
    "announcement_banner": "Scheduled maintenance Sunday 2–4 PM",
    "announcement_type": "info"
  },
  "theme": {
    "primary_color": "#6366f1",
    "accent_color": "#06b6d4",
    "success_color": "#10b981",
    "warning_color": "#f59e0b",
    "error_color": "#ef4444"
  }
}
```

### Email Notifications (SMTP)

```json
{
  "email": {
    "from": "noreply@example.com",
    "reply_to": "support@example.com",
    "smtp": {
      "host": "smtp.example.com",
      "port": 587,
      "secure": "tls",
      "username": "you@example.com",
      "password": "secret"
    }
  }
}
```

To send notifications on status change, run `include/cron/status_check_and_notify.php` on a cron schedule. The main status page tracks downtime automatically without cron.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `APP_USERNAME` | `admin` | Admin login username |
| `APP_PASSWORD` | `changeme` | Admin login password |
| `APP_AUTH_REQUIRED` | `true` | Set `false` to disable login requirement |
