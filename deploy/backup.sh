#!/usr/bin/env bash
# Daily database and uploaded-file backup (cron: 0 3 * * * bash /opt/nivaas/deploy/backup.sh)
set -euo pipefail
umask 077

BACKUP_DIR=/opt/backups
BACKUP_DATE=$(date +%F)
mkdir -p "$BACKUP_DIR"
cd "$(dirname "$0")/.."

DB_TMP=$(mktemp --suffix=.sql.gz "$BACKUP_DIR/.nivaas-db-XXXXXX")
UPLOAD_TMP=$(mktemp --suffix=.tar.gz "$BACKUP_DIR/.nivaas-uploads-XXXXXX")
trap 'rm -f "$DB_TMP" "$UPLOAD_TMP"' EXIT

docker compose exec -T db pg_dump -U nivaas -d nivaas | gzip > "$DB_TMP"
gzip -t "$DB_TMP"
docker compose exec -T app sh -c 'tar -czf - --exclude=./.restore-staging -C /data/uploads .' > "$UPLOAD_TMP"
gzip -t "$UPLOAD_TMP"

mv -f "$DB_TMP" "$BACKUP_DIR/nivaas-$BACKUP_DATE.sql.gz"
mv -f "$UPLOAD_TMP" "$BACKUP_DIR/nivaas-uploads-$BACKUP_DATE.tar.gz"
trap - EXIT

find "$BACKUP_DIR" -type f \( -name 'nivaas-*.sql.gz' -o -name 'nivaas-uploads-*.tar.gz' \) -mtime +14 -delete
