#!/usr/bin/env bash
# Daily database and uploaded-file backup (cron: 0 3 * * * bash /opt/nivaas/deploy/backup.sh)
set -euo pipefail
umask 077

BACKUP_DIR=${BACKUP_DIR:-/opt/backups}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
if [[ ! "$RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a positive whole number." >&2
  exit 2
fi
BACKUP_DATE=$(date +%F)
mkdir -p "$BACKUP_DIR"
cd "$(dirname "$0")/.."

exec 9>"$BACKUP_DIR/.nivaas-backup.lock"
if ! flock -n 9; then
  echo "A Nivaas backup is already running." >&2
  exit 1
fi

DB_TMP=$(mktemp --suffix=.sql.gz "$BACKUP_DIR/.nivaas-db-XXXXXX")
UPLOAD_TMP=$(mktemp --suffix=.tar.gz "$BACKUP_DIR/.nivaas-uploads-XXXXXX")
MANIFEST_TMP=$(mktemp "$BACKUP_DIR/.nivaas-manifest-XXXXXX")
trap 'rm -f "$DB_TMP" "$UPLOAD_TMP" "$MANIFEST_TMP"' EXIT

docker compose exec -T db pg_dump -U nivaas -d nivaas | gzip > "$DB_TMP"
gzip -t "$DB_TMP"
docker compose exec -T app sh -c 'tar -czf - --exclude=./.restore-staging -C /data/uploads .' > "$UPLOAD_TMP"
gzip -t "$UPLOAD_TMP"
if ! tar -tzf "$UPLOAD_TMP" | awk '/(^\/|(^|\/)\.\.(\/|$))/ { bad=1 } END { exit bad }'; then
  echo "The uploads backup contains an unsafe path." >&2
  exit 1
fi

DB_BACKUP="$BACKUP_DIR/nivaas-$BACKUP_DATE.sql.gz"
UPLOAD_BACKUP="$BACKUP_DIR/nivaas-uploads-$BACKUP_DATE.tar.gz"
MANIFEST="$BACKUP_DIR/nivaas-$BACKUP_DATE.sha256"
mv -f "$DB_TMP" "$DB_BACKUP"
mv -f "$UPLOAD_TMP" "$UPLOAD_BACKUP"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$DB_BACKUP")" "$(basename "$UPLOAD_BACKUP")") > "$MANIFEST_TMP"
mv -f "$MANIFEST_TMP" "$MANIFEST"
trap - EXIT

find "$BACKUP_DIR" -type f \( -name 'nivaas-*.sql.gz' -o -name 'nivaas-uploads-*.tar.gz' -o -name 'nivaas-*.sha256' \) -mtime +"$RETENTION_DAYS" -delete
