# Deploys the compute service to Vercel as a Python function.
#
# The engine's package depends on the whole analysis stack (pandas, scipy,
# scikit-learn, matplotlib, plotly), which is far over a function's size limit
# and is never imported by a request. A request only needs the engine and the
# service source plus fastapi, pydantic, z3 and a few small libraries, so this
# stages exactly that and deploys it. service/Dockerfile is the route for
# hosting the full service anywhere else.
#
#   $env:AUTOOPT_SERVICE_TOKEN = '<the token the web app sends>'
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-service.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
# The folder name is the Vercel project name.
$stage = Join-Path $env:TEMP 'autoopt-engine'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory $stage | Out-Null

Copy-Item (Join-Path $root 'engine\autoopt') (Join-Path $stage 'autoopt') -Recurse
Copy-Item (Join-Path $root 'service\autoopt_service') (Join-Path $stage 'autoopt_service') -Recurse
Get-ChildItem $stage -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force

Set-Content (Join-Path $stage 'app.py') -Encoding ascii -Value @(
    '"""Vercel entry point: the compute service, with the engine beside it."""'
    'from autoopt_service.app import app'
    ''
    '__all__ = ["app"]'
)
Set-Content (Join-Path $stage 'requirements.txt') -Encoding ascii -Value @(
    'fastapi>=0.115'
    'pydantic>=2.7'
    'z3-solver>=4.13'
    'httpx>=0.27'
    'rich>=13.7'
    'python-dotenv>=1.0'
    'typer>=0.12'
)
Set-Content (Join-Path $stage '.python-version') -Encoding ascii -Value '3.12'

Push-Location $stage
try {
    vercel link --yes --project autoopt-engine
    $deploy = @('deploy', '--prod', '--yes')
    if ($env:AUTOOPT_SERVICE_TOKEN) {
        $deploy += @('-e', "AUTOOPT_SERVICE_TOKEN=$env:AUTOOPT_SERVICE_TOKEN")
    } else {
        Write-Warning 'AUTOOPT_SERVICE_TOKEN is not set: the deployed service will accept any caller.'
    }
    vercel @deploy
} finally {
    Pop-Location
}
