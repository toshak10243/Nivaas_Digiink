#!/bin/bash
set -e

echo "Checking DNS for nivaas.space..."
DNS_IP=$(dig +short nivaas.space @8.8.8.8 | tail -n1)
echo "Current DNS IP for nivaas.space: $DNS_IP"

if [ "$DNS_IP" != "200.234.46.234" ]; then
  echo "WARNING: nivaas.space does not resolve to 200.234.46.234 yet (got: $DNS_IP)."
  echo "Please update your DNS A Record first."
  exit 1
fi

echo "Requesting SSL certificate from Let's Encrypt for nivaas.space and www.nivaas.space..."
certbot --nginx --non-interactive --agree-tos -m toshaksharma777@gmail.com -d nivaas.space -d www.nivaas.space --redirect

echo "Updating PUBLIC_URL in /var/www/nivaas/server/.env..."
sed -i 's|PUBLIC_URL=.*|PUBLIC_URL=https://nivaas.space|' /var/www/nivaas/server/.env

echo "Restarting Nivaas PM2 process..."
cd /var/www/nivaas/server && pm2 restart nivaas --update-env

echo "Testing Nginx configuration..."
nginx -t && systemctl reload nginx

echo "SUCCESS! nivaas.space is now live with HTTPS."

