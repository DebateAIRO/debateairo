$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Python = $env:PYTHON
if (-not $Python) {
    $Python = Join-Path $Root ".venv\Scripts\python.exe"
}
if (-not (Test-Path $Python)) {
    throw "Python not found: $Python"
}

if (-not $env:DIALECTICAL_USER_TOKEN) {
    $env:DIALECTICAL_USER_TOKEN = "user_dev_token"
}
if (-not $env:DIALECTICAL_DEV_WORKER_RELOAD) {
    $env:DIALECTICAL_DEV_WORKER_RELOAD = "0"
}
if (-not $env:PNPM) {
    $AppDataPnpm = Join-Path $env:APPDATA "npm\pnpm.cmd"
    if (Test-Path $AppDataPnpm) {
        $env:PNPM = $AppDataPnpm
    }
}

function Format-DevSecret {
    param([string] $Value)
    if ($env:DIALECTICAL_SHOW_DEV_TOKEN -eq "1") {
        return $Value
    }
    if (-not $Value) {
        return "(unset)"
    }
    if ($Value.Length -le 8) {
        return "***"
    }
    return "$($Value.Substring(0, 4))...$($Value.Substring($Value.Length - 4))"
}

$OutLog = Join-Path $Root ".make-dev.out.log"
$ErrLog = Join-Path $Root ".make-dev.err.log"
Remove-Item -LiteralPath $OutLog, $ErrLog -Force -ErrorAction SilentlyContinue

function Test-ListeningPort {
    param([int] $Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $connection
}

if ((Test-ListeningPort 3000) -and (Test-ListeningPort 8000)) {
    Write-Output "Dialectical dev stack already appears to be running."
    Write-Output "Web: http://127.0.0.1:3000"
    Write-Output "Token: $(Format-DevSecret $env:DIALECTICAL_USER_TOKEN)"
    exit 0
}

$Process = Start-Process `
    -WindowStyle Hidden `
    -FilePath $Python `
    -ArgumentList "scripts/dev.py" `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -PassThru

$Deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $Deadline) {
    if ((Test-ListeningPort 3000) -and (Test-ListeningPort 8000)) {
        Write-Output "Dialectical dev stack started."
        Write-Output "Web: http://127.0.0.1:3000"
        Write-Output "Token: $(Format-DevSecret $env:DIALECTICAL_USER_TOKEN)"
        Write-Output "Logs: $OutLog"
        exit 0
    }
    if ($Process.HasExited) {
        break
    }
    Start-Sleep -Seconds 1
}

Write-Output "Dialectical dev stack did not become ready."
Write-Output "stdout log: $OutLog"
Write-Output "stderr log: $ErrLog"
if (Test-Path $OutLog) {
    Get-Content -LiteralPath $OutLog -Tail 40
}
if (Test-Path $ErrLog) {
    Get-Content -LiteralPath $ErrLog -Tail 40
}
exit 1
