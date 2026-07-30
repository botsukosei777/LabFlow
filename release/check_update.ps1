# LabFlow Update Checker
param([string]$CurrentVersion)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
    $r = Invoke-RestMethod -Uri "https://api.github.com/repos/botsukosei777/LabFlow/releases/latest" -Headers @{"User-Agent"="LabFlow-Updater"} -TimeoutSec 10
    $tag = $r.tag_name -replace "v",""
    $asset = $r.assets | Where-Object { $_.name -like "*.zip" } | Select-Object -First 1
    if ($tag -and ([version]$tag -gt [version]$CurrentVersion) -and $asset) {
        Write-Output "UPDATE_AVAILABLE"
        Write-Output $tag
        Write-Output $asset.browser_download_url
    } else {
        Write-Output "UP_TO_DATE"
    }
} catch {
    Write-Output "CHECK_FAILED"
}
