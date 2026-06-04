#!/bin/bash
set -e

# Always deploy PHP application files from the image so updates take effect on restart.
find /var/www/defaults/include -name "*.php" | while IFS= read -r src; do
    dst="/var/www/html/include/${src#/var/www/defaults/include/}"
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
done

# Seed data/asset files only if they don't already exist (preserves user data).
cp -rn /var/www/defaults/include/. /var/www/html/include/
cp -rn /var/www/defaults/images/.  /var/www/html/images/

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
