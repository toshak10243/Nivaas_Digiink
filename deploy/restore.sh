#!/usr/bin/env bash
# Restore the paired database and upload archives created by backup.sh.
set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "Usage: bash deploy/restore.sh YYYY-MM-DD" >&2
  exit 2
fi

BACKUP_DIR=${BACKUP_DIR:-/opt/backups}
DB_BACKUP="$BACKUP_DIR/nivaas-$1.sql.gz"
UPLOAD_BACKUP="$BACKUP_DIR/nivaas-uploads-$1.tar.gz"
[[ -s "$DB_BACKUP" ]] || { echo "Missing database backup: $DB_BACKUP" >&2; exit 1; }
[[ -s "$UPLOAD_BACKUP" ]] || { echo "Missing uploads backup: $UPLOAD_BACKUP" >&2; exit 1; }
gzip -t "$DB_BACKUP"
gzip -t "$UPLOAD_BACKUP"
if ! tar -tzf "$UPLOAD_BACKUP" | awk '/(^\/|(^|\/)\.\.(\/|$))/ { bad=1 } END { exit bad }'; then
  echo "The uploads archive contains an unsafe path." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
echo "This replaces the Nivaas database and uploaded files with the $1 backups."
read -r -p "Type RESTORE to continue: " CONFIRM
[[ "$CONFIRM" == RESTORE ]] || { echo "Restore cancelled."; exit 1; }

docker compose stop app
docker compose exec -T db dropdb --if-exists -U nivaas nivaas
docker compose exec -T db createdb -U nivaas -O nivaas nivaas
gzip -dc "$DB_BACKUP" | docker compose exec -T db psql -X -v ON_ERROR_STOP=1 -U nivaas -d nivaas

docker compose run --rm -T --no-deps app mkdir -p /data/uploads/.restore-staging
docker compose run --rm -T --no-deps app tar -xzf - -C /data/uploads/.restore-staging < "$UPLOAD_BACKUP"
docker compose run --rm --no-deps app node -e 'const fs=require("node:fs");const path=require("node:path");const root="/data/uploads";const stage=path.join(root,".restore-staging");for(const name of fs.readdirSync(root)){if(name!==".restore-staging")fs.rmSync(path.join(root,name),{recursive:true,force:true})}for(const name of fs.readdirSync(stage))fs.renameSync(path.join(stage,name),path.join(root,name));fs.rmSync(stage,{recursive:true,force:true})'

docker compose up -d app
echo "Restore complete for $1. Check docker compose logs -f app and /health/ready."
