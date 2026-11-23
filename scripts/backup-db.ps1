<#
.SYNOPSIS
  Sao lưu cơ sở dữ liệu PostgreSQL của D'Lat Cafe Workforce ra file nén .sql.gz và tự giữ 14 bản gần nhất.
.EXAMPLE
  .\scripts\backup-db.ps1
  .\scripts\backup-db.ps1 -Mode docker -RetentionDays 14
  .\scripts\backup-db.ps1 -Mode local -Port 5433
#>
param(
  [ValidateSet("auto", "docker", "local")]
  [string]$Mode = "auto",
  [string]$ContainerName = "dlat_postgres_prod",
  [string]$PgHost = "127.0.0.1",
  [int]$Port = 5433,
  [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $ProjectRoot ".env"
$BackupDir = Join-Path $ProjectRoot "backups"

# Load defaults from .env if present
$PgUser = "cafe_admin"
$PgPassword = ""
$PgDb = "cafe_workforce"

if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*POSTGRES_USER=(.+)$') { $PgUser = $Matches[1].Trim().Trim('"').Trim("'") }
    if ($_ -match '^\s*POSTGRES_PASSWORD=(.+)$') { $PgPassword = $Matches[1].Trim().Trim('"').Trim("'") }
    if ($_ -match '^\s*POSTGRES_DB=(.+)$') { $PgDb = $Matches[1].Trim().Trim('"').Trim("'") }
    if ($_ -match '^\s*BACKUP_RETENTION_DAYS=(\d+)$') { $RetentionDays = [int]$Matches[1] }
  }
}

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

# Detect mode automatically
$ResolvedMode = $Mode
if ($ResolvedMode -eq "auto") {
  $dockerRunning = $false
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    $running = docker ps --format "{{.Names}}" 2>$null | Where-Object { $_ -eq $ContainerName }
    if ($running) { $dockerRunning = $true }
  }
  $ResolvedMode = if ($dockerRunning) { "docker" } else { "local" }
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$TempSql = Join-Path $BackupDir "dlat_cafe_${Timestamp}.sql"
$OutGz = "${TempSql}.gz"

Write-Host "[D'Lat Backup] Chế độ: $ResolvedMode | DB: $PgDb | Đích: $OutGz" -ForegroundColor Cyan

try {
  if ($ResolvedMode -eq "docker") {
    docker exec $ContainerName pg_dump -U $PgUser -d $PgDb --clean --if-exists --no-owner --no-privileges | Out-File -FilePath $TempSql -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "pg_dump trong container $ContainerName thất bại (exit $LASTEXITCODE)" }
  } else {
    $pgDumpExe = Get-Command pg_dump -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    if (-not $pgDumpExe) {
      $candidates = @(
        "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
      )
      $pgDumpExe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    }
    if (-not $pgDumpExe) {
      throw "Không tìm thấy pg_dump.exe. Hãy cài PostgreSQL client hoặc chạy với -Mode docker."
    }
    $env:PGPASSWORD = $PgPassword
    & $pgDumpExe -h $PgHost -p $Port -U $PgUser -d $PgDb --clean --if-exists --no-owner --no-privileges -f $TempSql
    if ($LASTEXITCODE -ne 0) { throw "pg_dump cục bộ thất bại (exit $LASTEXITCODE)" }
  }

  if (-not (Test-Path $TempSql) -or (Get-Item $TempSql).Length -eq 0) {
    throw "File dump rỗng, hủy quá trình nén."
  }

  # Compress .sql -> .sql.gz using native .NET GZipStream
  $inStream = [System.IO.File]::OpenRead($TempSql)
  $outStream = [System.IO.File]::Create($OutGz)
  $gzipStream = New-Object System.IO.Compression.GZipStream($outStream, [System.IO.Compression.CompressionLevel]::Optimal)
  try {
    $inStream.CopyTo($gzipStream)
  } finally {
    $gzipStream.Dispose()
    $outStream.Dispose()
    $inStream.Dispose()
  }
  Remove-Item $TempSql -Force

  # Rotate old backups beyond RetentionDays
  $Cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem -Path $BackupDir -Filter "dlat_cafe_*.sql.gz" | Where-Object { $_.LastWriteTime -lt $Cutoff } | Remove-Item -Force

  $SizeKb = [Math]::Round((Get-Item $OutGz).Length / 1KB, 2)
  Write-Host "[D'Lat Backup] Thành công! File: $OutGz ($SizeKb KB) | Giữ tối đa $RetentionDays ngày." -ForegroundColor Green
} catch {
  if (Test-Path $TempSql) { Remove-Item $TempSql -Force -ErrorAction SilentlyContinue }
  if (Test-Path $OutGz) { Remove-Item $OutGz -Force -ErrorAction SilentlyContinue }
  Write-Error $_
  exit 1
} finally {
  $env:PGPASSWORD = ""
}
