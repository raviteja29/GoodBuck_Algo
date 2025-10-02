# Zerodha Instruments Downloader
# Replace the values below with your actual API credentials

$API_KEY = "YOUR_API_KEY_HERE"
$ACCESS_TOKEN = "YOUR_ACCESS_TOKEN_HERE"

# Download instruments data
Write-Host "Downloading instruments data from Zerodha Kite API..."

try {
    $response = Invoke-RestMethod -Uri "https://api.kite.trade/instruments" -Headers @{
        "X-Kite-Version" = "3"
        "Authorization" = "token $API_KEY:$ACCESS_TOKEN"
    }
    
    # Save as CSV
    $response | Export-Csv -Path "instruments.csv" -NoTypeInformation
    Write-Host "Data saved to instruments.csv successfully!"
    
    # Also save as JSON for backup
    $response | ConvertTo-Json | Out-File "instruments.json"
    Write-Host "Backup saved to instruments.json successfully!"
    
    Write-Host "Total instruments downloaded: $($response.Count)"
    
} catch {
    Write-Error "Failed to download data: $($_.Exception.Message)"
    Write-Host "Please check your API credentials and internet connection."
}