$c = Get-NetTCPConnection -LocalPort 4520 -State Listen -ErrorAction SilentlyContinue
foreach ($x in $c) { Stop-Process -Id $x.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Start-Process -FilePath 'node' -ArgumentList 'serve.mjs' -WorkingDirectory 'C:\Users\cagat\agents-office' -WindowStyle Minimized
Start-Sleep -Seconds 7
foreach ($u in @('/api/health','/api/patron','/patron')) {
  try {
    $r = Invoke-WebRequest -Uri ('http://localhost:4520' + $u) -UseBasicParsing -TimeoutSec 15
    Write-Output ($u + ' -> ' + $r.StatusCode + ' (' + $r.Content.Length + ' bayt)')
  } catch { Write-Output ($u + ' -> FAIL ' + $_.Exception.Message) }
}
