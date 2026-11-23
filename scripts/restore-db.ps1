<#
.SYNOPSIS
  Khôi phục cơ sở dữ liệu PostgreSQL của D'Lat Cafe Workforce từ file .sql.gz hoặc .sql.
.EXAMPLE
  .\scripts\restore-db.ps1 -BackupFile .\backups\dlat_cafe_20261123_030000.sql.gz
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [ValidateSet("auto", "docker", "local")]
  [string]$Mode = "auto",
  [string]$ContainerName = "dlat_postgres_prod",
  [string]$PgHost = "127.0.0.1",
  [int]$Port = 5433,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) {
  Write-Error "Không tìm thấy file backup: $BackupFile"
  exit 1
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $ProjectRoot ".env"
$PgUser = "cafe_admin"
$PgPassword = ""
$PgDb = "cafe_workforce"

if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*POSTGRES_USER=(.+)$') { $PgUser = $Matches[1].Trim().Trim('"').Trim("'") }
    if ($_ -match '^\s*POSTGRES_PASSWORD=(.+)$') { $PgPassword = $Matches[1].Trim().Trim('"').Trim("'") }
    if ($_ -match '^\s*POSTGRES_DB=(.+)$') { $PgDb = $Matches[1].Trim().Trim('"').Trim("'") }
  }
}

$ResolvedMode = $Mode
if ($ResolvedMode -eq "auto") {
  $dockerRunning = $false
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    $running = docker ps --format "{{.Names}}" 2>$null | Where-Object { $_ -eq $ContainerName }
    if ($running) { $dockerRunning = $true }
  }
  $ResolvedMode = if ($dockerRunning) { "docker" } else { "local" }
}

if (-not $Force) {
  Write-Warning "Thao tác này sẽ GHI ĐÈ dữ liệu hiện có trong database '$PgDb' (chế độ: $ResolvedMode) bằng file '$BackupFile'."
  $confirm = Read-Host "Gõ YES để xác nhận khôi phục"
  if ($confirm -ne "YES") {
    Write-Host "Đã hủy khôi phục." -ForegroundColor Yellow
    exit 0
  }
}

$TempSql = $null
$SqlToLoad = (Resolve-Path $BackupFile).Path

try {
  if ($SqlToLoad.EndsWith(".gz")) {
    $TempSql = [System.IO.Path]::GetTempFileName() + ".sql"
    $inStream = [System.IO.File]::OpenRead($SqlToLoad)
    $gzipStream = New-Object System.IO.Compression.GZipStream($inStream, [System.IO.Compression.CompressionMode]::Decompress)
    $outStream = [System.IO.File]::Create($TempSql)
    try {
      $gzipStream.CopyTo($outStream)
    } finally {
      $outStream.Dispose()
      $gzipStream.Dispose()
      $inStream.Dispose()
    }
    $SqlToLoad = $TempSql
  }

  Write-Host "[D'Lat Restore] Đang nạp dữ liệu vào '$PgDb' ($ResolvedMode)..." -ForegroundColor Cyan

  if ($ResolvedMode -eq "docker") {
    Get-Content $SqlToLoad -Raw | docker exec -i $ContainerName psql -v ON_ERROR_STOP=1 -U $PgUser -d $PgDb
    if ($LASTEXITCODE -ne 0) { throw "Khôi phục vào container $ContainerName thất bại (exit $LASTEXITCODE)" }
  } else {
    $psqlExe = Get-Command psql -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    if (-not $psqlExe) {
      $candidates = @(
        "C:\Program Files\PostgreSQL\18\bin\psql.exe",
        "C:\Program Files\PostgreSQL\17\bin\psql.exe",
        "C:\Program Files\PostgreSQL\16\bin\psql.exe"
      )
      $psqlExe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    }
    if (-not $psqlExe) {
      throw "Không tìm thấy psql.exe."
    }
    $env:PGPASSWORD = $PgPassword
    & $psqlExe -h $PgHost -p $Port -U $PgUser -d $PgDb -v ON_ERROR_STOP=1 -f $SqlToLoad
    if ($LASTEXITCODE -ne 0) { throw "Khôi phục cục bộ thất bại (exit $LASTEXITCODE)" }
  }

  Write-Host "[D'Lat Restore] Khôi phục cơ sở dữ liệu thành công!" -ForegroundColor Green
} finally {
  $env:PGPASSWORD = ""
  if ($TempSql -and (Test-Path $TempSql)) {
    Remove-Item $TempSql -Force -ErrorAction SilentlyContinue
  }
}
