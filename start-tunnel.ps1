# ExamHero Backend Tunnel - Auto Restart Script
# Run this once and it will keep the tunnel alive forever
$subdomain = "examhero-api-beta"
$port = 5000
$urlFile = "$PSScriptRoot\tunnel-url.txt"

Write-Host "=== ExamHero Tunnel Auto-Restart ===" -ForegroundColor Cyan
Write-Host "Subdomain: $subdomain" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray

while ($true) {
    Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] Starting localtunnel..." -ForegroundColor Green
    
    # Start localtunnel and capture URL
    $proc = Start-Process -FilePath "npx" `
        -ArgumentList "-y localtunnel --port $port --subdomain $subdomain" `
        -PassThru -NoNewWindow -RedirectStandardOutput "$PSScriptRoot\tunnel-output.txt"
    
    # Wait a bit then read URL
    Start-Sleep -Seconds 5
    $tunnelOutput = Get-Content "$PSScriptRoot\tunnel-output.txt" -ErrorAction SilentlyContinue
    $urlLine = $tunnelOutput | Where-Object { $_ -match "your url is" }
    
    if ($urlLine) {
        $url = ($urlLine -split ": ")[1].Trim()
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Tunnel LIVE: $url" -ForegroundColor Cyan
        Set-Content -Path $urlFile -Value $url
    }
    
    # Wait for process to exit (tunnel crash/disconnect)
    $proc.WaitForExit()
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Tunnel disconnected. Restarting in 3 seconds..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}
