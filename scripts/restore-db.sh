#!/usr/bin/env bash
set -euo pipefail

# Khôi phục PostgreSQL D'Lat Cafe Workforce từ file .sql.gz hoặc .sql
if [ $# -lt 1 ]; then
  echo "Cách dùng: ./scripts/restore-db.sh <path-to-backup.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Không tìm thấy file backup: ${BACKUP_FILE}" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONTAINER_NAME="${CONTAINER_NAME:-dlat_postgres_prod}"

if [ -f "${PROJECT_ROOT}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${PROJECT_ROOT}/.env"
  set +a
fi

PGUSER="${POSTGRES_USER:-cafe_admin}"
PGDB="${POSTGRES_DB:-cafe_workforce}"

echo "CẢNH BÁO: Thao tác này sẽ GHI ĐÈ toàn bộ dữ liệu trong database '${PGDB}' bằng '${BACKUP_FILE}'."
read -r -p "Gõ YES để xác nhận khôi phục: " CONFIRM
if [ "${CONFIRM}" != "YES" ]; then
  echo "Đã hủy khôi phục."
  exit 0
fi

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${CONTAINER_NAME}"; then
  if [[ "${BACKUP_FILE}" == *.gz ]]; then
    gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER_NAME}" psql -v ON_ERROR_STOP=1 -U "${PGUSER}" -d "${PGDB}"
  else
    docker exec -i "${CONTAINER_NAME}" psql -v ON_ERROR_STOP=1 -U "${PGUSER}" -d "${PGDB}" < "${BACKUP_FILE}"
  fi
else
  if [[ "${BACKUP_FILE}" == *.gz ]]; then
    gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5433}" -U "${PGUSER}" -d "${PGDB}" -v ON_ERROR_STOP=1
  else
    PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5433}" -U "${PGUSER}" -d "${PGDB}" -v ON_ERROR_STOP=1 -f "${BACKUP_FILE}"
  fi
fi

echo "[D'Lat Restore] Khôi phục cơ sở dữ liệu thành công!"
