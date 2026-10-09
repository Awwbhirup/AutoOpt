# Stops everything demo-start.ps1 started, plus anything else still holding
# the demo ports (a dev server started some other way, for instance).

$Host.UI.RawUI.WindowTitle = 'AutoOpt - stopping'
$state = Join-Path $env:LOCALAPPDATA 'AutoOpt'
$pidFile = Join-Path $state 'pids.txt'

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }

function KillTree($id) {
    if (Get-Process -Id $id -ErrorAction SilentlyContinue) {
        & taskkill.exe /T /F /PID $id 2>&1 | Out-Null
        return $true
    }
    return $false
}

Say ''
Say '  AutoOpt' 'Cyan'
Say '  ------------------------------------------' 'DarkGray'

$stopped = 0
if (Test-Path $pidFile) {
    foreach ($line in Get-Content $pidFile) {
        if ($line -match '^\d+$' -and (KillTree ([int]$line))) { $stopped++ }
    }
    Remove-Item $pidFile -Force
}

foreach ($port in 3000, 8000) {
    $owners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($id in $owners) {
        $name = (Get-Process -Id $id -ErrorAction SilentlyContinue).ProcessName
        if ($name -in 'node', 'python', 'uvicorn') {
            if (KillTree $id) { $stopped++ }
        } elseif ($name) {
            Say "  Port $port is held by $name (pid $id), left alone." 'Yellow'
        }
    }
}

$left = Get-NetTCPConnection -State Listen -LocalPort 3000, 8000 -ErrorAction SilentlyContinue
if ($left) {
    Say '  Something is still listening on :3000 or :8000.' 'Yellow'
} elseif ($stopped -gt 0) {
    Say '  Engine and web app stopped.' 'Green'
} else {
    Say '  Nothing was running.' 'Green'
}
Say '  ------------------------------------------' 'DarkGray'
Start-Sleep -Seconds 3
