$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
try {
    if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) { throw 'Install Docker Desktop and start its Linux containers engine first.' }
    $containerOS = & docker.exe info --format '{{.OSType}}'
    if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop, then run this launcher again.' }
    if ($containerOS -ne 'linux') { throw 'Switch Docker Desktop to Linux containers, then try again.' }
    $settings = Join-Path $PSScriptRoot '.local-docker.env'
    if (-not (Test-Path -LiteralPath $settings)) {
        $testPassword = 'Gs-' + [guid]::NewGuid().ToString('N')
        @('OWNER_EMAIL=demo@groupsend.test', ('OWNER_PASSWORD=' + $testPassword)) | Set-Content -LiteralPath $settings -Encoding ASCII
    }
    Write-Host 'Building the same container setup used by Render. First build may take several minutes.'
    & docker.exe compose -p groupsend-render-test -f compose.local.yaml up --build -d --wait --wait-timeout 180
    if ($LASTEXITCODE -ne 0) { throw 'Container startup failed. Run: docker compose -p groupsend-render-test -f compose.local.yaml logs --tail=100' }
    Write-Host 'Local test credentials (separate from Render):'
    Get-Content -LiteralPath $settings | Write-Host
    Start-Process notepad.exe -ArgumentList ('"' + $settings + '"')
    Start-Process 'http://localhost:4322/login'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
