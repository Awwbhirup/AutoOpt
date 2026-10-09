# Deploys the compute service to Vercel by hand. Pushing to main does the same
# through .github/workflows/deploy-service.yml once CI passes, so this is for
# deploying something that is not on main yet.
#
# The function is the two packages plus the files in service/vercel: an entry
# point and a requirements list holding only what a request imports. The
# service's token lives in the Vercel project's environment, not here.
#
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-service.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $env:TEMP 'autoopt-engine'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory $stage | Out-Null

Copy-Item (Join-Path $root 'engine\autoopt') (Join-Path $stage 'autoopt') -Recurse
Copy-Item (Join-Path $root 'service\autoopt_service') (Join-Path $stage 'autoopt_service') -Recurse
Get-ChildItem (Join-Path $root 'service\vercel') -Force | Copy-Item -Destination $stage
Get-ChildItem $stage -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force

Push-Location $stage
try {
    vercel link --yes --project autoopt-engine
    vercel deploy --prod --yes
} finally {
    Pop-Location
}
