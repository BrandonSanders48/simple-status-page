#!/bin/bash
set -e

# Seed include/ on a fresh volume (PHP files missing = first start)
if [ ! -f "/var/www/html/include/status_ajax.php" ]; then
    echo "[entrypoint] Fresh include/ volume — seeding application files..."
    cp -rn /var/www/defaults/include/. /var/www/html/include/
fi

# Seed images/ on a fresh volume (favicon missing = first start)
if [ ! -f "/var/www/html/images/favicon.ico" ]; then
    echo "[entrypoint] Fresh images/ volume — seeding default images..."
    cp -rn /var/www/defaults/images/. /var/www/html/images/
fi

# Always ensure runtime directories exist and are writable by www-data
# (runs as root so chown always works regardless of host mount permissions)
mkdir -p \
    /var/www/html/include/cron \
    /var/www/html/include/uploads \
    /var/www/html/ssl \
    /var/www/html/images

chown -R www-data:www-data \
    /var/www/html/include \
    /var/www/html/images \
    /var/www/html/ssl

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
