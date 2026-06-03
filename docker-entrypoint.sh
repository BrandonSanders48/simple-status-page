#!/bin/bash
set -e

# On a brand-new volume mount the include/ directory is empty.
# Copy the default config so the app starts without errors.
if [ ! -f "/var/www/html/include/configuration.json" ]; then
    echo "[entrypoint] Fresh volume detected — copying default configuration..."
    cp /var/www/defaults/configuration.json /var/www/html/include/configuration.json
    chown www-data:www-data /var/www/html/include/configuration.json
fi

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
