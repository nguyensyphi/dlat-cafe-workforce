#!/usr/bin/env bash
# D'lat Cafe Workforce Management - Automated Linux / Docker Backup Script
# Usage: ./scripts/backup-db.sh

set -euo pipefail

HOST="${POSTGRES_HOST:-127.0.0.1}"
PORT="${POSTGRES_PORT:-5432}"
USER="${POSTGRES_USER:-postgres}"
DB="${POSTGRES_DB:-cafe_workforce}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS=14

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DUMP_FILE="$BACKUP_DIR/dlat_backup_$TIMESTAMP.dump"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup of $DB from $HOST:$PORT..."
pg_dump -h "$HOST" -p "$PORT" -U "$USER" -F c -b -f "$DUMP_FILE" "$DB"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup complete: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

# Retention: Delete backups older than 14 days
find "$BACKUP_DIR" -type f -name "dlat_backup_*.dump" -mtime +"$RETENTION_DAYS" -exec rm -f {} \;
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Retention policy applied (kept last $RETENTION_DAYS days)."

