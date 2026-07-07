FROM php:8.5-apache

# Install cron, curl, ping, openssl
RUN apt-get update && apt-get install -y \
    cron curl iputils-ping openssl \
    && rm -rf /var/lib/apt/lists/*

# Enable Apache SSL and rewrite modules
RUN a2enmod ssl rewrite

# Generate self-signed certificate, explicitly set CA:FALSE and server extensions
# so modern browsers (Chrome, Chromium on Yodeck, etc.) don't reject it as a CA cert.
RUN openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/ssl/private/apache-selfsigned.key \
    -out /etc/ssl/certs/apache-selfsigned.crt \
    -subj "/C=US/ST=State/L=City/O=StatusPage/CN=localhost" \
    -addext "basicConstraints=CA:FALSE" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    -addext "keyUsage=digitalSignature,keyEncipherment" \
    -addext "extendedKeyUsage=serverAuth"

# Suppress the ServerName warning
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# Apache SSL virtual host (deny direct access to ssl/ cert directory)
RUN echo '<VirtualHost *:443>\n\
    DocumentRoot /var/www/html\n\
    SSLEngine on\n\
    SSLCertificateFile /etc/ssl/certs/apache-selfsigned.crt\n\
    SSLCertificateKeyFile /etc/ssl/private/apache-selfsigned.key\n\
    <Directory /var/www/html>\n\
        AllowOverride All\n\
        Require all granted\n\
    </Directory>\n\
    <Directory /var/www/html/ssl>\n\
        Require all denied\n\
    </Directory>\n\
</VirtualHost>' > /etc/apache2/sites-available/ssl.conf

RUN a2ensite ssl

# Remove default Apache page (optional)
RUN rm -rf /var/www/html/*

# Copy your website into Apache's web root
COPY . /var/www/html

# Save include/ and images/ outside the webroot so the entrypoint can seed
# brand-new empty volume mounts on first start
RUN mkdir -p /var/www/defaults \
    && cp -r /var/www/html/include /var/www/defaults/include \
    && cp -r /var/www/html/images  /var/www/defaults/images

# Set permissions
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

# PHP error settings
RUN echo "display_errors = Off" >> /usr/local/etc/php/conf.d/docker-php.ini \
    && echo "log_errors = On" >> /usr/local/etc/php/conf.d/docker-php.ini \
    && echo "error_log = /var/log/php_errors.log" >> /usr/local/etc/php/conf.d/docker-php.ini

# ------------------------------------------------------------------
# Cron job: calls your status_check_and_notify.php every minute
# ------------------------------------------------------------------
RUN echo "*/2 * * * * echo \"[RUN] \$(date)\" >> /var/log/cron.log && /usr/local/bin/php /var/www/html/include/cron/status_check_and_notify.php >> /var/log/cron.log 2>&1" \
    > /etc/cron.d/app-cron

# Permissions for cron file
RUN chmod 0644 /etc/cron.d/app-cron

# Register cron job
RUN crontab /etc/cron.d/app-cron

# Create cron log file
RUN touch /var/log/cron.log

# Entrypoint applies custom SSL cert if uploaded, then starts cron + Apache
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
CMD ["/docker-entrypoint.sh"]

EXPOSE 80 443
