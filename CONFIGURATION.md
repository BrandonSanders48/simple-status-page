# Configuration Guide

This guide explains all available configuration options in `include/configuration.json`.

## Table of Contents

1. [Metadata](#metadata)
2. [Branding & Theming](#branding--theming)
3. [Email & SMTP](#email--smtp)
4. [Network Settings](#network-settings)
5. [SLA Configuration](#sla-configuration)
6. [Service Monitoring](#service-monitoring)
7. [RSS Feeds](#rss-feeds)
8. [Advanced Options](#advanced-options)

---

## Metadata

Configuration file metadata and versioning.

```json
{
  "meta": {
    "version": "2.0",
    "description": "Configuration description",
    "author": "Your Name or Team"
  }
}
```

- **version**: Config schema version (shown in footer)
- **description**: Human-readable description of the configuration
- **author**: Author/team name (shown in footer)

---

## Branding & Theming

Customize the appearance and branding of your status page.

### Branding Section

```json
{
  "branding": {
    "business_name": "Your Company",
    "business_logo": "https://example.com/logo.png",
    "company_url": "https://example.com",
    "support_email": "support@example.com",
    "support_phone": "+1-555-0123",
    "footer_message": "© 2026 Your Company. All rights reserved.",
    "announcement_banner": "System maintenance scheduled",
    "announcement_type": "info"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `business_name` | string | Display name shown in navbar and page title |
| `business_logo` | string (URL) | Company logo image URL (recommended: 40px height) |
| `company_url` | string (URL) | Company website URL (shown in footer) |
| `support_email` | string (email) | Support email address (shown in footer) |
| `support_phone` | string | Support phone number (shown in footer) |
| `footer_message` | string | Copyright/legal message displayed in footer |
| `announcement_banner` | string | Optional announcement banner text |
| `announcement_type` | string | Banner style: `info`, `warning`, or `error` |

### Theme Section

Customize colors to match your brand identity.

```json
{
  "theme": {
    "primary_color": "#4f46e5",
    "accent_color": "#06b6d4",
    "success_color": "#059669",
    "warning_color": "#d97706",
    "error_color": "#dc2626"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `primary_color` | hex color | Primary brand color |
| `accent_color` | hex color | Accent/secondary color |
| `success_color` | hex color | Success/operational status color |
| `warning_color` | hex color | Warning/degraded status color |
| `error_color` | hex color | Error/outage status color |

---

## Email & SMTP

Configure email notifications for subscriptions and alerts.

```json
{
  "email": {
    "from": "status@yourdomain.com",
    "reply_to": "helpdesk@yourdomain.com",
    "smtp": {
      "host": "smtp.yourdomain.com",
      "port": 587,
      "secure": "tls"
    }
  }
}
```

### Environment Variables

Override SMTP credentials via environment variables (recommended for Docker):

```bash
SMTP_USER=your-username
SMTP_PASS=your-password
```

---

## Network Settings

Configure network connectivity checks.

```json
{
  "network": {
    "gateway": "192.168.1.1",
    "public_dns": "8.8.8.8",
    "domain": "domain.local",
    "description": "Network settings for local and public connectivity",
    "isp_map": {
      "203.0.113.1": "Primary ISP",
      "203.0.113.2": "Secondary ISP"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `gateway` | IP address | Local gateway IP for network checks |
| `public_dns` | IP address | Public DNS server for external connectivity |
| `domain` | string | Internal domain name |
| `description` | string | Description of network settings |
| `isp_map` | object | Map ISP IPs to names for better display |

---

## SLA Configuration

Display uptime targets and SLA information.

```json
{
  "sla": {
    "enabled": true,
    "uptime_target": 99.9,
    "reporting_period": "monthly"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Show SLA target in navbar |
| `uptime_target` | number | Uptime percentage target (e.g., 99.9) |
| `reporting_period` | string | Reporting period: `daily`, `weekly`, `monthly`, `yearly` |

---

## Service Monitoring

Configure internal services to monitor.

```json
{
  "internal_hosts": [
    {
      "host": "192.168.1.10",
      "port": 443,
      "type": "HTTPS",
      "name": "Web Server",
      "description": "Main production web server"
    },
    {
      "host": "8.8.8.8",
      "port": 53,
      "type": "DNS",
      "name": "Google DNS",
      "description": "External DNS connectivity"
    },
    {
      "host": "192.168.1.5",
      "port": null,
      "type": "Ping",
      "name": "Backup Server",
      "description": "Disaster recovery site"
    }
  ]
}
```

### Service Type Descriptions

| Type | Port Required | Description |
|------|---|-------------|
| `HTTPS` | Yes | HTTPS/TLS connection check |
| `HTTP` | Yes | HTTP connection check |
| `DNS` | Yes | DNS query to port (typically 53) |
| `Ping` | No | ICMP ping check |

---

## RSS Feeds

Display external status feeds (vendor status pages, etc.).

```json
{
  "RSS": [
    {
      "host": "https://status.example.com/rss",
      "name": "Example Service",
      "tag": "item",
      "description": "Status feed for Example Service"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `host` | URL | RSS feed URL |
| `name` | string | Display name |
| `tag` | string | XML tag name containing feed items (usually `item`) |
| `description` | string | Description of the feed |

### Popular Status Page RSS URLs

- **Atlassian**: `https://status.atlassian.com/history.rss`
- **GitHub**: `https://www.githubstatus.com/history.rss`
- **AWS**: `https://status.aws.amazon.com/rss/all.rss`
- **Google Cloud**: `https://status.cloud.google.com/incidents.rss`

---

## Advanced Options

### Refresh Rate

```json
{
  "refresh_rate": 30000
}
```

Status page auto-refresh interval in milliseconds (default: 30000 = 30 seconds).

### Alert Sound

```json
{
  "alert_sound": false
}
```

Enable/disable alert sound for status changes (requires `audio/alert.wav`).

### Browser Notifications

```json
{
  "browser_notify": true
}
```

Enable/disable browser push notifications for status changes.

### Maintenance Windows

```json
{
  "maintenance_windows": [
    {
      "title": "Scheduled Maintenance",
      "start": "2026-06-15T02:00:00Z",
      "end": "2026-06-15T04:00:00Z",
      "description": "Database migration"
    }
  ]
}
```

### Status Categories

```json
{
  "status_categories": {
    "operational": { "label": "Operational", "color": "#059669" },
    "degraded": { "label": "Degraded Performance", "color": "#d97706" },
    "outage": { "label": "Outage", "color": "#dc2626" },
    "maintenance": { "label": "Maintenance", "color": "#6366f1" }
  }
}
```

---

## Environment Variables

Override configuration via Docker environment variables:

```bash
APP_USERNAME=admin              # Admin login username
APP_PASSWORD=changeme           # Admin login password
APP_AUTH_REQUIRED=true          # Require authentication
SMTP_USER=username              # SMTP username
SMTP_PASS=password              # SMTP password
```

### Docker Example

```bash
docker run -d \
  -e APP_USERNAME="admin" \
  -e APP_PASSWORD="secure-password" \
  -e APP_AUTH_REQUIRED="true" \
  -e SMTP_USER="noreply@example.com" \
  -e SMTP_PASS="smtp-password" \
  -p 8080:80 \
  -v ${PWD}/configuration.json:/usr/share/nginx/html/include/configuration.json \
  brandonsanders/simple-status-page
```

---

## Example: Complete Configuration

```json
{
  "meta": {
    "version": "2.0",
    "description": "Production Status Page",
    "author": "DevOps Team"
  },
  "branding": {
    "business_name": "ACME Corp",
    "business_logo": "https://acme.example.com/logo.png",
    "company_url": "https://acme.example.com",
    "support_email": "support@acme.example.com",
    "support_phone": "+1-555-0123",
    "footer_message": "© 2026 ACME Corporation. All rights reserved.",
    "announcement_banner": "",
    "announcement_type": "info"
  },
  "theme": {
    "primary_color": "#1f2937",
    "accent_color": "#3b82f6",
    "success_color": "#10b981",
    "warning_color": "#f59e0b",
    "error_color": "#ef4444"
  },
  "sla": {
    "enabled": true,
    "uptime_target": 99.99,
    "reporting_period": "monthly"
  },
  "internal_hosts": [
    {
      "host": "api.internal.local",
      "port": 443,
      "type": "HTTPS",
      "name": "API Server",
      "description": "REST API endpoint"
    },
    {
      "host": "8.8.8.8",
      "port": 53,
      "type": "DNS",
      "name": "DNS Resolution",
      "description": "External DNS check"
    }
  ],
  "refresh_rate": 30000,
  "browser_notify": true
}
```

---

## Tips

1. **Keep it simple** – Only configure what you need
2. **Use HTTPS URLs** – Always use HTTPS for external resources
3. **Test your config** – Use the JSON editor to validate your configuration
4. **Backup regularly** – Export your config before making changes
5. **Monitor colors** – Ensure good contrast in light and dark modes
6. **Use environment variables** – Keep sensitive data (passwords) in env vars, not config files
