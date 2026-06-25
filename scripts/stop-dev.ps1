$ErrorActionPreference = "SilentlyContinue"

$ports = @(5001, 5173)
$connections = Get-NetTCPConnection -LocalPort $ports | Where-Object { $_.State -eq "Listen" }
$processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $processIds) {
  if ($processId -and $processId -ne 0) {
    Stop-Process -Id $processId -Force
    Write-Host "Stopped process $processId using Caira dev port."
  }
}

exit 0
