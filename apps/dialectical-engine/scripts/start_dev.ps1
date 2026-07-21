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

function Repair-ProcessPathEnvironment {
    $ProcessEnv = [System.Environment]::GetEnvironmentVariables("Process")
    $PathKeys = @($ProcessEnv.Keys | Where-Object { $_ -ieq "Path" })
    if ($PathKeys.Count -le 1) {
        return
    }

    $PathValue = $env:Path
    foreach ($PathKey in $PathKeys) {
        [System.Environment]::SetEnvironmentVariable($PathKey, $null, "Process")
    }
    [System.Environment]::SetEnvironmentVariable("Path", $PathValue, "Process")
}

Repair-ProcessPathEnvironment

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

function Test-HttpEndpoint {
    param([string] $Uri)
    try {
        $Response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 5
        return $Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500
    } catch {
        return $false
    }
}

function Test-DevStackReady {
    return (Test-HttpEndpoint "http://127.0.0.1:3000") -and `
        (Test-HttpEndpoint "http://127.0.0.1:8000/api/backends/status")
}

function Get-V2GenerationReadiness {
    $Headers = @{}
    if ($env:DIALECTICAL_USER_TOKEN) {
        $Headers["Authorization"] = "Bearer $($env:DIALECTICAL_USER_TOKEN)"
    }
    try {
        $Status = Invoke-RestMethod `
            -Uri "http://127.0.0.1:8000/api/backends/status" `
            -Headers $Headers `
            -TimeoutSec 5
        return $Status.v2_generation_readiness
    } catch {
        return [pscustomobject]@{
            ready = $false
            reason = "Canonical backend readiness check failed."
            reason_code = "backend_status_unavailable"
        }
    }
}

function Write-DevStackReady {
    param(
        [string] $StartedMessage,
        [string] $LogsPath = "",
        $Readiness = $null
    )
    if ($null -eq $Readiness) {
        $Readiness = Get-V2GenerationReadiness
    }
    Write-Output $StartedMessage
    Write-Output "Web: http://127.0.0.1:3000"
    Write-Output "Token: $(Format-DevSecret $env:DIALECTICAL_USER_TOKEN)"
    if ($LogsPath) {
        Write-Output "Logs: $LogsPath"
    }
    if ($Readiness -and $Readiness.ready -eq $true) {
        Write-Output "V2 generation readiness: ready"
        return
    }
    $Reason = "Real gpt-5.6sol-medium worker is required."
    if ($Readiness -and $Readiness.reason) {
        $Reason = $Readiness.reason
    }
    $ReasonCode = ""
    if ($Readiness -and $Readiness.reason_code) {
        $ReasonCode = " ($($Readiness.reason_code))"
    }
    Write-Output "Coordinator/web are up, but V2 generation is not ready: $Reason$ReasonCode"
}

if (Test-DevStackReady) {
    $Readiness = Get-V2GenerationReadiness # /api/backends/status v2_generation_readiness ready
    Write-DevStackReady "Dialectical dev stack already appears to be running." "" $Readiness
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
    if (Test-DevStackReady) {
        $Readiness = Get-V2GenerationReadiness # /api/backends/status v2_generation_readiness ready
        Write-DevStackReady "Dialectical dev stack started." $OutLog $Readiness
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
