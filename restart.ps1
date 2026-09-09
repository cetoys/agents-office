$c = Get-NetTCPConnection -LocalPort 4520 -State Listen -ErrorAction SilentlyContinue
foreach ($x in $c) { Write-Output ("kill " + $x.OwningProcess); Stop-Process -Id $x.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Set-Location 'C:\Users\cagat\agents-office'
Start-Process -FilePath 'node' -ArgumentList 'serve.mjs' -WorkingDirectory 'C:\Users\cagat\agents-office' -WindowStyle Minimized
Start-Sleep -Seconds 5
try { $r = Invoke-WebRequest -Uri 'http://localhost:4520/api/health' -UseBasicParsing -TimeoutSec 10; Write-Output ("health " + $r.StatusCode) } catch { Write-Output ("health FAIL " + $_.Exception.Message) }
