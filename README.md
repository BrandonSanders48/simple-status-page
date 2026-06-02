# Simple Status Page

A sleek, production-ready status page built with HTML/PHP/Tailwind CSS. Features real-time service monitoring, incident management, email subscriptions, RSS feed integration, and comprehensive branding customization.

## Screenshot

![Simple Status Page](images/screenshot.png)

## Features

✅ **Real-time Monitoring** – Monitor internal services and network connectivity  
✅ **Incident Management** – Create, track, and manage incidents with timestamps  
✅ **Email Subscriptions** – Users can subscribe to service updates  
✅ **RSS Feed Integration** – Display external status feeds (e.g., vendor status pages)  
✅ **Customizable Branding** – Company logo, colors, footer, announcement banners  
✅ **SLA Support** – Display uptime targets and SLA status  
✅ **Multi-Language** – Built-in English/Spanish support  
✅ **Dark Mode** – Beautiful dark theme with system preference detection  
✅ **Responsive Design** – Works perfectly on mobile, tablet, and desktop  
✅ **Docker Ready** – Includes Dockerfile and Docker Compose support  
✅ **SMTP Email** – Send email notifications via configured SMTP server  

## Configuration Highlights

### Branding & Theme
Customize the appearance of your status page:

```json
{
  "branding": {
    "business_name": "Your Company",
    "business_logo": "https://example.com/logo.png",
    "company_url": "https://example.com",
    "support_email": "support@example.com",
    "support_phone": "+1-555-0123",
    "footer_message": "© 2026 Your Company. All rights reserved.",
    "announcement_banner": "Scheduled maintenance on Sunday 2-4 PM EST",
    "announcement_type": "info"
  },
  "theme": {
    "primary_color": "#4f46e5",
    "accent_color": "#06b6d4",
    "success_color": "#059669",
    "warning_color": "#d97706",
    "error_color": "#dc2626"
  }
}
```

### SLA Configuration
Display uptime targets:

```json
{
  "sla": {
    "enabled": true,
    "uptime_target": 99.9,
    "reporting_period": "monthly"
  }
}
```

### Service Monitoring
Monitor internal services with flexible status types:

```json
{
  "internal_hosts": [
    {
      "host": "192.168.1.1",
      "port": 443,
      "type": "HTTPS",
      "name": "Web Server",
      "description": "Main web server"
    },
    {
      "host": "8.8.8.8",
      "port": 53,
      "type": "DNS",
      "name": "Public DNS",
      "description": "Google DNS connectivity check"
    }
  ]
}
```

## Default Login

**Username:** `admin`  
**Password:** `changeme`  

> You can change these credentials in `include/configuration.json` or via the JSON editor in the UI.

## Usage

### Option 1: Build from source

1. Clone or download the repository.  
2. Make sure Docker is installed.  
3. Build the Docker image:  
    ```bash
    docker build -t simple-status-page .
    ```
4. Run the container:
    ```bash
    docker run -d -p 8080:80 -e APP_USERNAME="admin" -e APP_PASSWORD="changeme" -e APP_AUTH_REQUIRED="true" simple-status-page
    ```
    Your status page will be accessible at [http://localhost:8080](http://localhost:8080).

### Option 2: Use the ready-made image

Pull and run the pre-built image from Docker Hub:

```bash
docker run -d \
    --name simple-status-page \
    -p 8080:80 \
    -v ${PWD}:/usr/share/nginx/html \
    -e APP_USERNAME="admin" \
    -e APP_PASSWORD="changeme" \
    -e APP_AUTH_REQUIRED="true" \
    brandonsanders/simple-status-page
```

This will start the status page immediately. You can mount your own JSON config to customize it.

