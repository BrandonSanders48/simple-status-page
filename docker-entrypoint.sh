#!/bin/bash
set -e

# Apply custom SSL certificate if uploaded via the settings page
if [ -f "/var/www/html/ssl/cert.pem" ] && [ -f "/var/www/html/ssl/key.pem" ]; then
    echo "[entrypoint] Applying custom SSL certificate..."
    cp /var/www/html/ssl/cert.pem /etc/ssl/certs/apache-selfsigned.crt
    cp /var/www/html/ssl/key.pem  /etc/ssl/private/apache-selfsigned.key
    chmod 644 /etc/ssl/certs/apache-selfsigned.crt
    chmod 600 /etc/ssl/private/apache-selfsigned.key
else
    echo "[entrypoint] No custom certificate found — using self-signed cert."
fi

cron
exec apache2-foreground
