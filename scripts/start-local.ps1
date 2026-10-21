[CmdletBinding()]
param(
    [ValidateSet("Start", "Stop", "Status")]
    [string]$Action = "Start",
    [switch]$Preview
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$webDir = Join-Path $repoRoot "web"
$runtimeDir = Join-Path $repoRoot ".local\web-mvp"
$stateFile = Join-Path $runtimeDir "processes.json"

function Get-ManagedProcess($Entry) {
    $process = Get-Process -Id $Entry.id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $Entry.started) { return $process }
    return $null
}

function Stop-ManagedServices($Entries) {
    foreach ($entry in $Entries) {
        if (Get-ManagedProcess $entry) {
            # Stop only the process tree whose identity was recorded by this script.
            & taskkill.exe /PID $entry.id /T /F | Out-Null
        }
    }
}

$managed = @()
if (Test-Path -LiteralPath $stateFile) {
    # Windows PowerShell 5.1 emits a JSON array as one pipeline object.
    # Enumerate the parsed array explicitly so status/stop handle each service.
    $parsed = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $managed = @($parsed | ForEach-Object { $_ })
}
if ($Action -eq "Stop") {
    Stop-ManagedServices $managed
    if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile }
    Write-Host "Huabu 本地服务已停止。数据和日志已保留。"
    exit 0
}
if ($Action -eq "Status") {
    foreach ($entry in $managed) {
        $running = $null -ne (Get-ManagedProcess $entry)
        Write-Host "$($entry.name): $(if ($running) { 'running' } else { 'stopped' }) (PID $($entry.id))"
    }
    Write-Host "Web: http://localhost:1010; API: http://127.0.0.1:2010"
    Write-Host "Logs: $runtimeDir"
    exit 0
}

foreach ($commandName in @("go", "bun")) {
    if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) { throw "未找到 $commandName，请先安装项目要求的运行时。" }
}
if ($managed | Where-Object { $null -ne (Get-ManagedProcess $_) }) {
    throw "已有本脚本启动的服务。请先用 -Action Status 查看，或用 -Action Stop 停止。"
}
foreach ($port in @(1010, 2010)) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listener) { throw "端口 $port 已被占用，请确认现有服务后再启动。" }
}

$dataDir = Join-Path $repoRoot ".local\project-workbench-debug"
$goBuildCache = Join-Path $repoRoot ".local\cache\go-build"
$goModuleCache = Join-Path $repoRoot ".local\cache\go-mod"
foreach ($directory in @($dataDir, $goBuildCache, $goModuleCache, $runtimeDir)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}
if (-not (Test-Path -LiteralPath (Join-Path $webDir "node_modules\vite\bin\vite.js"))) {
    Push-Location $webDir
    try {
        & bun install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw "bun install 失败。" }
    } finally { Pop-Location }
}
if ($Preview -and -not (Test-Path -LiteralPath (Join-Path $webDir "dist\index.html"))) {
    throw "请先在 web 目录运行 bun run build，再使用 -Preview。"
}
$powerShellPath = (Get-Process -Id $PID).Path
function ConvertTo-PowerShellLiteral([string]$Value) { return "'" + $Value.Replace("'", "''") + "'" }

$backendCommand = @"
`$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $(ConvertTo-PowerShellLiteral $backendDir)
`$env:CANVAS_BACKEND_ADDR = '127.0.0.1:2010'
`$env:CANVAS_BACKEND_DATA_DIR = $(ConvertTo-PowerShellLiteral $dataDir)
`$env:GOCACHE = $(ConvertTo-PowerShellLiteral $goBuildCache)
`$env:GOMODCACHE = $(ConvertTo-PowerShellLiteral $goModuleCache)
`$env:HUABU_ALLOWED_ORIGINS = 'http://localhost:1010,http://127.0.0.1:1010'
`$env:HUABU_UI_BOOTSTRAP = '1'
& go run ./cmd/server
exit `$LASTEXITCODE
"@
$webTask = if ($Preview) { "start" } else { "dev" }
$webCommand = @"
`$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $(ConvertTo-PowerShellLiteral $webDir)
`$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:2010'
& bun run $webTask --host 127.0.0.1 --strictPort
exit `$LASTEXITCODE
"@

$started = @()
try {
    foreach ($service in @(@{ name = "backend"; command = $backendCommand; directory = $backendDir }, @{ name = "web"; command = $webCommand; directory = $webDir })) {
        $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($service.command))
        $process = Start-Process -FilePath $powerShellPath -WindowStyle Hidden -WorkingDirectory $service.directory -PassThru -ArgumentList @("-NoLogo", "-NoProfile", "-EncodedCommand", $encoded) -RedirectStandardOutput (Join-Path $runtimeDir "$($service.name).log") -RedirectStandardError (Join-Path $runtimeDir "$($service.name).error.log")
        $started += @{ name = $service.name; id = $process.Id; started = $process.StartTime.ToUniversalTime().Ticks.ToString() }
        ConvertTo-Json -InputObject @($started) | Set-Content -LiteralPath $stateFile -Encoding utf8
    }
    $ready = $false
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    while ([DateTime]::UtcNow -lt $deadline) {
        foreach ($entry in $started) { if (-not (Get-ManagedProcess $entry)) { throw "$($entry.name) 启动失败，请查看 $runtimeDir 中的日志。" } }
        try {
            $api = Invoke-WebRequest "http://127.0.0.1:2010/api/health/live" -UseBasicParsing -TimeoutSec 2
            $web = Invoke-WebRequest "http://127.0.0.1:1010" -UseBasicParsing -TimeoutSec 5
            if ($api.StatusCode -eq 200 -and $web.StatusCode -eq 200) { $ready = $true; break }
        } catch { $healthError = $_.Exception.Message; Start-Sleep -Milliseconds 500 }
    }
    if (-not $ready) { throw "服务未能在 45 秒内就绪：$healthError。请查看 $runtimeDir 中的日志。" }
} catch {
    Stop-ManagedServices $started
    if (Test-Path -LiteralPath $stateFile) { Remove-Item -LiteralPath $stateFile }
    throw
}
Write-Host "Huabu 已启动：http://localhost:1010" -ForegroundColor Green
Write-Host "日志：$runtimeDir"
Write-Host "查看状态：.\scripts\start-local.ps1 -Action Status"
Write-Host "停止服务：.\scripts\start-local.ps1 -Action Stop"
