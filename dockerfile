FROM php:8.2-apache

# Remove default Apache page (optional)
RUN rm -rf /var/www/html/*

# Copy your website into Apache's web root
COPY . /var/www/html

# Set permissions
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html

# Disable displaying errors
RUN echo "display_errors = Off" >> /usr/local/etc/php/conf.d/docker-php.ini \
    && echo "log_errors = On" >> /usr/local/etc/php/conf.d/docker-php.ini \
    && echo "error_log = /var/log/php_errors.log" >> /usr/local/etc/php/conf.d/docker-php.ini


EXPOSE 80
