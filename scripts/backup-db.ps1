# D'lat Cafe Workforce Management - Automated Daily Database Backup Script
# Usage: powershell -ExecutionPolicy Bypass -File scripts/backup-db.ps1

param(
    [string]$HostName = "127.0.0.1",
    [int]$Port = 5433,
    [string]$User = "cafe_admin",
    [string]$DbName = "cafe_workforce",
    [string]$BackupDir = "c:\Users\LENOVO\Downloads\KHÔNG QUAN TRỌNG\Quản lý D'lat\cafe-workforce\backups",
    [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$targetDir = [System.IO.Path]::GetFullPath($BackupDir)

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

$dumpFile = Join-Path $targetDir "dlat_backup_$timestamp.dump"
$logFile = Join-Path $targetDir "backup.log"

Write-Host "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] Starting backup for database $DbName..." -ForegroundColor Cyan

$pgDumpPath = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
if (-not (Test-Path $pgDumpPath)) {
    $pgDumpPath = "pg_dump"
}

try {
    & $pgDumpPath -h $HostName -p $Port -U $User -F c -b -v -f $dumpFile $DbName
    if ($LASTEXITCODE -eq 0) {
        $fileSize = (Get-Item $dumpFile).Length / 1MB
        $msg = "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] SUCCESS: Backup saved to $dumpFile ({0:N2} MB)" -f $fileSize
        Write-Host $msg -ForegroundColor Green
        Add-Content -Path $logFile -Value $msg

        # Retention Cleanup: Remove backups older than $RetentionDays days
        Get-ChildItem -Path $targetDir -Filter "dlat_backup_*.dump" |
            Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
            ForEach-Object {
                Remove-Item $_.FullName -Force
                $cleanMsg = "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] CLEANUP: Removed old backup $($_.Name)"
                Write-Host $cleanMsg -ForegroundColor Yellow
                Add-Content -Path $logFile -Value $cleanMsg
            }
    } else {
        throw "pg_dump failed with exit code $LASTEXITCODE"
    }
} catch {
    $errMsg = "[$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))] ERROR: Backup failed: $_"
    Write-Host $errMsg -ForegroundColor Red
    Add-Content -Path $logFile -Value $errMsg
    exit 1
}

