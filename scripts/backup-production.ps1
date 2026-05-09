param(
    [string]$ProjectRoot = "D:\sdm-system 2\sdm-system",
    [string]$BackupRoot = "D:\sdm-backups"
)

$ErrorActionPreference = "Stop"

function Ensure-Path {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "路径不存在: $Path"
    }
}

function New-CleanDirectory {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Path | Out-Null
}

Ensure-Path $ProjectRoot

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $BackupRoot $timestamp
$dbDir = Join-Path $backupDir "db"
$filesDir = Join-Path $backupDir "files"
$configDir = Join-Path $backupDir "config"
$secretsDir = Join-Path $backupDir "secrets"
$manifestPath = Join-Path $backupDir "manifest.txt"

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
New-CleanDirectory $backupDir
New-Item -ItemType Directory -Force -Path $dbDir, $filesDir, $configDir, $secretsDir | Out-Null

$envFile = Join-Path $ProjectRoot ".env"
$composeFile = Join-Path $ProjectRoot "docker-compose.yml"
$uploadsDir = Join-Path $ProjectRoot "backend\uploads"
$wechatPayDir = Join-Path $ProjectRoot "secrets\wechat_pay"
$tunnelDir = Join-Path $ProjectRoot "tunnel"

Ensure-Path $envFile
Ensure-Path $composeFile
Ensure-Path $uploadsDir
Ensure-Path $wechatPayDir
Ensure-Path $tunnelDir

$envMap = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') {
        return
    }
    $parts = $_ -split '=', 2
    $envMap[$parts[0].Trim()] = $parts[1].Trim()
}

$mysqlRootPassword = $envMap["MYSQL_ROOT_PASSWORD"]
$mysqlDatabase = $envMap["MYSQL_DB"]

if ([string]::IsNullOrWhiteSpace($mysqlRootPassword)) {
    throw ".env 中缺少 MYSQL_ROOT_PASSWORD"
}

if ([string]::IsNullOrWhiteSpace($mysqlDatabase)) {
    throw ".env 中缺少 MYSQL_DB"
}

$mysqlContainer = "sdm-mysql"
$dockerPipes = @(
    "\\.\pipe\dockerDesktopLinuxEngine",
    "\\.\pipe\docker_engine"
)

if (-not ($dockerPipes | Where-Object { Test-Path $_ })) {
    throw "Docker daemon is not available. Start Docker Desktop first."
}

$containerCheck = docker ps --format "{{.Names}}" | Select-String -Pattern "^${mysqlContainer}$"
if (-not $containerCheck) {
    throw "Running MySQL container not found: $mysqlContainer"
}

$dbDumpPath = Join-Path $dbDir "sdm_db.sql"
$manifestLines = @()
$manifestLines += "备份时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$manifestLines += "项目目录: $ProjectRoot"
$manifestLines += "数据库容器: $mysqlContainer"
$manifestLines += "数据库名: $mysqlDatabase"

Write-Host "1/5 Export MySQL dump..."
$dumpCommand = "mysqldump -u root -p${mysqlRootPassword} --single-transaction --quick --routines --triggers ${mysqlDatabase}"
docker exec $mysqlContainer sh -c $dumpCommand > $dbDumpPath

Write-Host "2/5 Copy uploads..."
Copy-Item -LiteralPath $uploadsDir -Destination (Join-Path $filesDir "uploads") -Recurse -Force

Write-Host "3/5 Copy payment certs..."
Copy-Item -LiteralPath $wechatPayDir -Destination (Join-Path $secretsDir "wechat_pay") -Recurse -Force

Write-Host "4/5 Copy config files..."
Copy-Item -LiteralPath $envFile -Destination (Join-Path $configDir ".env") -Force
Copy-Item -LiteralPath $composeFile -Destination (Join-Path $configDir "docker-compose.yml") -Force
Copy-Item -LiteralPath $tunnelDir -Destination (Join-Path $configDir "tunnel") -Recurse -Force

Write-Host "5/5 Write manifest..."
$manifestLines += "数据库备份: $dbDumpPath"
$manifestLines += "上传目录备份: $(Join-Path $filesDir 'uploads')"
$manifestLines += "支付证书备份: $(Join-Path $secretsDir 'wechat_pay')"
$manifestLines += "配置备份: $configDir"
$manifestLines | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Host ""
Write-Host "Backup completed: $backupDir"
Write-Host "Next step: run one restore drill."
