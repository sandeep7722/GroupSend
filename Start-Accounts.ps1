$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$url = 'http://localhost:4321'
$dataDir = Join-Path $PSScriptRoot '.local-cloud'
function Read-Health {
    try { return Invoke-RestMethod -Uri "$url/health" -TimeoutSec 3 } catch { return $null }
}
try {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $node) { throw 'Install Node.js 24 LTS first: https://nodejs.org' }
    if ([int]((& $node.Source -p 'process.versions.node.split(String.fromCharCode(46))[0]')) -lt 20) { throw 'Node.js 20 or newer is required.' }
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    $health = Read-Health
    if ($health -and $health.app -ne 'groupsend-cloud') { throw 'Port 4321 is used by another app.' }
    if (-not $health) {
        if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules/whatsapp-web.js/package.json'))) {
            Write-Host 'Installing dependencies. Please wait...'
            $env:PUPPETEER_SKIP_DOWNLOAD = 'true'
            $env:npm_config_offline = 'false'
            $env:npm_config_cache = Join-Path $PSScriptRoot '.npm-cache'
            & npm.cmd ci --ignore-scripts --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw 'Installation failed. Check internet and try again.' }
        }
        & $node.Source cloud/local.js --setup
        if ($LASTEXITCODE -ne 0) { throw 'Local account setup failed.' }
        $serverProcess = Start-Process -FilePath $node.Source -ArgumentList 'cloud/local.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataDir 'server.log') -RedirectStandardError (Join-Path $dataDir 'server-error.log') -PassThru
        $serverProcess.Id | Set-Content -LiteralPath (Join-Path $dataDir 'server.pid')
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 500
            $health = Read-Health
            if ($health) { break }
            if ($serverProcess.HasExited) { break }
        }
        if (-not $health -or $health.app -ne 'groupsend-cloud') { throw 'App start failed. Check .local-cloud/server-error.log in this folder.' }
    }
    $loginFile = Join-Path $dataDir 'demo-login.txt'
    if (Test-Path -LiteralPath $loginFile) {
        Get-Content -LiteralPath $loginFile | Write-Host
        # Visible because this is the login information the user needs to copy.
        Start-Process notepad.exe -ArgumentList ('"' + $loginFile + '"')
    }
    Start-Process "$url/login"
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
