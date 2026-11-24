$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $runtime = Join-Path $PSScriptRoot 'tools\FreeCAD_1.1.4-Windows-x86_64-py311\bin\python.exe'
    if (-not (Test-Path $runtime)) {
        throw 'Portable FreeCAD runtime not found. Open BuildHome.FCMacro in an installed FreeCAD instead.'
    }
    & $runtime (Join-Path $PSScriptRoot 'run_freecad.py')
    if ($LASTEXITCODE -ne 0) { throw 'FreeCAD generation failed; inspect output\build-error.txt.' }
    $report = Get-Content 'output\validation.json' -Raw | ConvertFrom-Json
    if ($report.ifc_status -eq 'FAILED') { throw $report.ifc_error }
    Copy-Item 'README.md' 'output\Guide.md' -Force
    Write-Host "Saved output\Home.FCStd and output\Home.ifc."
} finally {
    Pop-Location
}
