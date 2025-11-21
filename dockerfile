FROM php:8.2-apache

# Install cron
RUN apt-get update && apt-get install -y cron && rm -rf /var/lib/apt/lists/*

# Install necessary utilities
RUN apt-get update && apt-get install -y curl \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y iputils-ping

# Remove default Apache page (optional)
RUN rm -rf /var/www/html/*

# Copy your website into Apache's web root
COPY . /var/www/html

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

# Start cron + Apache
CMD cron && apache2-foreground

EXPOSE 80
