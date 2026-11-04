#!/bin/sh
# Daily DB backup (cron: 0 3 * * * /opt/nivaas/deploy/backup.sh)
set -e
mkdir -p /opt/backups
cd "$(dirname "$0")/.."
docker compose exec -T db pg_dump -U nivaas nivaas | gzip > /opt/backups/nivaas-$(date +%F).sql.gz
find /opt/backups -name 'nivaas-*.sql.gz' -mtime +14 -delete
