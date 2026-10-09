# Starts the whole stack for a local demo: compute service on :8000, web app
# on :3000 (production build, rebuilt only when web/ changed since the last
# one), then opens the browser. demo-stop.ps1 shuts it all down again.

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'AutoOpt - starting'

$root = Split-Path $PSScriptRoot -Parent
$web = Join-Path $root 'web'
$service = Join-Path $root 'service'
$python = Join-Path $root '.venv\Scripts\python.exe'
$next = Join-Path $web 'node_modules\next\dist\bin\next'
$state = Join-Path $env:LOCALAPPDATA 'AutoOpt'
$pidFile = Join-Path $state 'pids.txt'
$site = 'http://localhost:3000'
New-Item -ItemType Directory -Force $state | Out-Null

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }

function Fail($text, $log) {
    Say ''
    Say $text 'Red'
    if ($log -and (Test-Path $log)) {
        Say "Last lines of $log :" 'DarkGray'
        Get-Content $log -Tail 20 | ForEach-Object { Say "  $_" 'DarkGray' }
    }
    Say ''
    Read-Host 'Press Enter to close'
    exit 1
}

function Responds($url) {
    try {
        $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 5
        return $r.StatusCode -lt 500
    } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        return ($null -ne $resp) -and ([int]$resp.StatusCode -lt 500)
    } catch {
        return $false
    }
}

function WaitFor($url, $proc, $seconds, $log) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        if (Responds $url) { Write-Host ''; return }
        if ($proc -and $proc.HasExited) { Fail "It stopped before it was ready." $log }
        Write-Host '.' -NoNewline
        Start-Sleep -Milliseconds 700
    }
    Fail "Still not answering at $url after $seconds seconds." $log
}

function Remember($proc) { Add-Content $pidFile $proc.Id }

Say ''
Say '  AutoOpt' 'Cyan'
Say '  ------------------------------------------' 'DarkGray'

foreach ($need in @($python, $next)) {
    if (-not (Test-Path $need)) { Fail "Missing $need. Run 'make install' first." }
}
if (-not (Test-Path $pidFile)) { New-Item -ItemType File $pidFile | Out-Null }

# Compute service
if (Responds 'http://127.0.0.1:8000/health') {
    Say '  Engine      already running on :8000' 'Green'
} else {
    Write-Host '  Engine      starting ' -NoNewline
    $log = Join-Path $state 'engine.log'
    $p = Start-Process $python -WorkingDirectory $service -WindowStyle Hidden -PassThru `
        -ArgumentList '-m', 'uvicorn', 'autoopt_service.app:app', '--host', '127.0.0.1', '--port', '8000' `
        -RedirectStandardOutput (Join-Path $state 'engine.out.log') -RedirectStandardError $log
    Remember $p
    WaitFor 'http://127.0.0.1:8000/health' $p 90 $log
    Say '  Engine      ready on :8000' 'Green'
}

# Web app
if (Responds $site) {
    Say '  Web app     already running on :3000' 'Green'
} else {
    # Rebuild only if something under web/ is newer than the last build.
    $buildId = Join-Path $web '.next\BUILD_ID'
    $stale = -not (Test-Path $buildId)
    if (-not $stale) {
        $built = (Get-Item $buildId).LastWriteTime
        $skip = @('node_modules', '.next', '.shots', '.vercel', 'next-env.d.ts', 'tsconfig.tsbuildinfo')
        $newer = Get-ChildItem $web -Force | Where-Object { $skip -notcontains $_.Name } | ForEach-Object {
            if ($_.PSIsContainer) { Get-ChildItem $_.FullName -Recurse -File -Force } else { $_ }
        } | Where-Object { $_.LastWriteTime -gt $built } | Select-Object -First 1
        $stale = $null -ne $newer
    }

    $env:AUTH_TRUST_HOST = 'true'
    if ($stale) {
        Say '  Web app     code changed, building (about 2 minutes)...' 'Yellow'
        $log = Join-Path $state 'build.log'
        $b = Start-Process 'node' -WorkingDirectory $web -WindowStyle Hidden -PassThru -Wait `
            -ArgumentList "`"$next`"", 'build' `
            -RedirectStandardOutput $log -RedirectStandardError (Join-Path $state 'build.err.log')
        if ($b.ExitCode -ne 0) { Fail 'The web build failed.' $log }
        Say '  Web app     built' 'Green'
    }

    Write-Host '  Web app     starting ' -NoNewline
    $log = Join-Path $state 'web.log'
    $p = Start-Process 'node' -WorkingDirectory $web -WindowStyle Hidden -PassThru `
        -ArgumentList "`"$next`"", 'start', '-p', '3000' `
        -RedirectStandardOutput $log -RedirectStandardError (Join-Path $state 'web.err.log')
    Remember $p
    WaitFor $site $p 90 $log
    Say '  Web app     ready on :3000' 'Green'
}

Say '  ------------------------------------------' 'DarkGray'
Say "  Opening $site" 'Cyan'
Say '  Use "AutoOpt - Stop" on the Desktop when you are done.' 'DarkGray'
# Chrome rather than the system default browser; the default is only the
# fallback when Chrome is not installed.
$chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) { Start-Process $chrome $site } else { Start-Process $site }
Start-Sleep -Seconds 6
