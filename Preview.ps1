param([int]$Port = 8765)
$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot 'tools\FreeCAD_1.1.4-Windows-x86_64-py311\bin\python.exe'
if (-not (Test-Path $runtime)) {
    throw 'Portable Python not found. Serve the output folder with any local static HTTP server, for example: python -m http.server 8765 --directory output'
}
Write-Host "Open http://127.0.0.1:$Port/ . Press Ctrl+C to stop the server."
& $runtime -m http.server $Port --bind 127.0.0.1 --directory (Join-Path $PSScriptRoot 'output')
