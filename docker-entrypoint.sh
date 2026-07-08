#!/bin/bash
set -e

# Ensure runtime directories exist and are writable regardless of how the volume
# arrived (a fresh bind mount is typically root-owned on the host).
mkdir -p /data/uploads /data/ssl
chown -R nextjs:nodejs /data

# Generate a self-signed certificate on first boot if no custom one has been uploaded,
# so the HTTPS listener always has something to serve. Lands on the persisted volume
# (not baked into the image) so an admin-uploaded cert survives container restarts.
if [ ! -f /data/ssl/cert.pem ] || [ ! -f /data/ssl/key.pem ]; then
    echo "[entrypoint] No certificate found, generating a self-signed one..."
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout /data/ssl/key.pem \
        -out /data/ssl/cert.pem \
        -subj "/C=US/ST=State/L=City/O=StatusPage/CN=localhost" \
        -addext "basicConstraints=CA:FALSE" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
        -addext "keyUsage=digitalSignature,keyEncipherment" \
        -addext "extendedKeyUsage=serverAuth"
    # Marks this pair as auto-generated so the admin UI can tell it apart from a real
    # uploaded cert (both just look like "files exist" otherwise). The upload route
    # removes this marker whenever a real pair is promoted.
    touch /data/ssl/.self-signed
    chown nextjs:nodejs /data/ssl/cert.pem /data/ssl/key.pem /data/ssl/.self-signed
else
    echo "[entrypoint] Using existing certificate from /data/ssl."
fi

echo "[entrypoint] Running database migrations..."
gosu nextjs ./node_modules/.bin/tsx migrate.ts

echo "[entrypoint] Starting server..."
exec gosu nextjs node server.js
