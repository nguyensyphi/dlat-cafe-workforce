#!/usr/bin/env bash
set -euo pipefail

# Sao lưu PostgreSQL D'Lat Cafe Workforce ra file .sql.gz và giữ 14 bản gần nhất
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/backups"
CONTAINER_NAME="${CONTAINER_NAME:-dlat_postgres_prod}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [ -f "${PROJECT_ROOT}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${PROJECT_ROOT}/.env"
  set +a
fi

PGUSER="${POSTGRES_USER:-cafe_admin}"
PGDB="${POSTGRES_DB:-cafe_workforce}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "${BACKUP_DIR}"
TS="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/dlat_cafe_${TS}.sql.gz"

echo "[D'Lat Backup] Đang sao lưu database '${PGDB}' -> ${OUT_FILE}"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${CONTAINER_NAME}"; then
  docker exec "${CONTAINER_NAME}" pg_dump -U "${PGUSER}" -d "${PGDB}" --clean --if-exists --no-owner --no-privileges | gzip -9 > "${OUT_FILE}"
else
  PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5433}" -U "${PGUSER}" -d "${PGDB}" --clean --if-exists --no-owner --no-privileges | gzip -9 > "${OUT_FILE}"
fi

if [ ! -s "${OUT_FILE}" ]; then
  echo "[D'Lat Backup] LỖI: File backup rỗng!" >&2
  rm -f "${OUT_FILE}"
  exit 1
fi

find "${BACKUP_DIR}" -type f -name 'dlat_cafe_*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
echo "[D'Lat Backup] Hoàn tất ($(du -h "${OUT_FILE}" | cut -f1)). Đã giữ các bản trong ${RETENTION_DAYS} ngày gần nhất."
