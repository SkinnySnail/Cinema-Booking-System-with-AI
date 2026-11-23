# Run from any directory. Manages one consolidated env file and the full application stack.
# Examples:
#   .\start-app.ps1                             # Interactive menu
#   .\start-app.ps1 start                       # Fast start existing containers (auto-unpause if paused)
#   .\start-app.ps1 up -EnvFile .\.env.all      # Sync env & run using pre-built images (no rebuild)
#   .\start-app.ps1 pause                       # Pause running containers (keep memory/state)
#   .\start-app.ps1 unpause                     # Resume paused containers
#   .\start-app.ps1 stop                        # Stop containers (keep containers & DB data)
#   .\start-app.ps1 rebuild -EnvFile .\.env.all # Sync env, rebuild images & recreate containers (keep DB)
#   .\start-app.ps1 reset -EnvFile .\.env.all   # Wipe containers + DB volume & start fresh from scratch
#   .\start-app.ps1 status                      # Show container status
#   .\start-app.ps1 sync -EnvFile .\.env.all    # Only sync env files without touching Docker
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('', 'menu', 'start', 'up', 'pause', 'unpause', 'stop', 'rebuild', 'reset', 'status', 'sync')]
    [string]$Action = '',
    [string]$EnvFile = '',
    [switch]$SyncEnvOnly,
    [switch]$NoBuild,
    [switch]$NoNgrok,
    [switch]$NoOllama,
    [switch]$NoBrowser,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$savedEnvironment = @{}
foreach ($name in @('AI_SERVICE_KEY', 'CINEMA_AI_BUNDLE_DIR', 'NGROK_AUTHTOKEN', 'NGROK_DOMAIN')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

$rootEnvKeys = @(
    'NGROK_AUTHTOKEN', 'NGROK_DOMAIN',
    'MYSQL_ROOT_PASSWORD', 'MYSQL_DATABASE', 'DB_PORT', 'TZ',
    'BACKEND_PORT', 'FRONTEND_PORT',
    'CINEMA_DB_PORT', 'CINEMA_API_PORT', 'CINEMA_WEB_PORT',
    'AI_SERVICE_KEY', 'CINEMA_AI_BUNDLE_DIR',
    'BACKEND_IMAGE', 'FRONTEND_IMAGE', 'AI_IMAGE',
    'VITE_API_URL', 'VITE_PUSHER_KEY', 'VITE_PUSHER_CLUSTER',
    'VITE_MAPTILER_KEY', 'VITE_ORS_API_KEY', 'VITE_ORS_API_KEY_2'
)

$backendEnvKeys = @(
    'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USERNAME', 'DB_PASSWORD', 'DB_CHARSET',
    'JWT_SECRET', 'JWT_EXPIRATION',
    'SMTP_ENABLED', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_ENCRYPTION',
    'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL', 'SMTP_FROM_NAME',
    'VNP_TMNCODE', 'VNP_HASH_SECRET', 'VNP_URL', 'VNPAY_RETURN_URL', 'VNPAY_NOTIFY_URL',
    'PUSHER_APP_ID', 'PUSHER_KEY', 'PUSHER_SECRET', 'PUSHER_CLUSTER',
    'AI_ENABLED', 'AI_SERVICE_URL', 'AI_SERVICE_KEY',
    'CLOUDINARY_ENABLED', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET', 'CLOUDINARY_FOLDER',
    'APP_URL', 'FRONTEND_URL'
)

$frontendEnvKeys = @(
    'VITE_API_URL', 'VITE_PUSHER_KEY', 'VITE_PUSHER_CLUSTER',
    'VITE_MAPTILER_KEY', 'VITE_ORS_API_KEY', 'VITE_ORS_API_KEY_2'
)

function Find-Executable([string]$Name, [string[]]$Candidates) {
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    foreach ($candidate in $Candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $null
}

function Read-EnvMap([string]$Path) {
    $map = [ordered]@{}
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { return $map }
    foreach ($rawLine in (Get-Content -LiteralPath $Path -Encoding UTF8)) {
        $line = $rawLine.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { continue }
        if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim()
            if ($val.Length -ge 2 -and (
                ($val.StartsWith('"') -and $val.EndsWith('"')) -or
                ($val.StartsWith("'") -and $val.EndsWith("'"))
            )) {
                $val = $val.Substring(1, $val.Length - 2)
            }
            $map[$key] = $val
        }
    }
    return $map
}

function Write-MergedEnvFile([string]$TargetPath, [System.Collections.IDictionary]$Updates, [string]$HeaderComment) {
    $parent = Split-Path -Parent $TargetPath
    if ($parent -and !(Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    $lines = New-Object System.Collections.Generic.List[string]
    if (Test-Path -LiteralPath $TargetPath -PathType Leaf) {
        foreach ($line in (Get-Content -LiteralPath $TargetPath -Encoding UTF8)) {
            $lines.Add($line)
        }
    } elseif ($HeaderComment) {
        $lines.Add($HeaderComment)
    }

    $seen = @{}
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
            $k = $matches[1]
            if ($Updates.Contains($k)) {
                $lines[$i] = "$k=$($Updates[$k])"
                $seen[$k] = $true
            }
        }
    }
    foreach ($k in $Updates.Keys) {
        if (!$seen.ContainsKey($k)) {
            $lines.Add("$k=$($Updates[$k])")
        }
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllLines($TargetPath, $lines, $utf8NoBom)
}

function Wait-Ready([string]$Description, [scriptblock]$Check, [int]$TimeoutSeconds = 120) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try { if (& $Check) { return } } catch { }
        Write-Progress -Activity $Description -Status ('Waiting... {0}s' -f [int]$timer.Elapsed.TotalSeconds)
        Start-Sleep -Seconds 2
    }
    throw "$Description did not become ready within $TimeoutSeconds seconds."
}

function Select-ActionFromMenu {
    Write-Host ''
    Write-Host '================ Galaxy Cinema Launcher ================' -ForegroundColor Cyan
    Write-Host '  [1] Start nhanh container da tao san (khong build, tu unpause)'
    Write-Host '  [2] Chay tren image da build san (sync env + up -d --no-build)'
    Write-Host '  [3] Pause (tam dung container, giu nguyen trang thai RAM)'
    Write-Host '  [4] Unpause (tiep tuc container dang pause)'
    Write-Host '  [5] Stop (dung container, giu nguyen container & du lieu DB)'
    Write-Host '  [6] Rebuild (sync env + build lai image + tao lai container, giu DB)'
    Write-Host '  [7] Reset tu dau (xoa container & DB volume, build + seed lai)'
    Write-Host '  [8] Status (xem trang thai cac container)'
    Write-Host '  [9] Sync env only (dong bo file env dau vao ve ./.env duy nhat)'
    Write-Host '  [0] Thoat'
    Write-Host '========================================================' -ForegroundColor Cyan
    $choice = (Read-Host 'Chon thao tac (0-9)').Trim()
    switch ($choice) {
        '1' { return 'start' }
        '2' { return 'up' }
        '3' { return 'pause' }
        '4' { return 'unpause' }
        '5' { return 'stop' }
        '6' { return 'rebuild' }
        '7' { return 'reset' }
        '8' { return 'status' }
        '9' { return 'sync' }
        '0' { return '' }
        default { throw "Lua chon khong hop le: '$choice'" }
    }
}

function Resolve-InputEnvFile([string]$Requested) {
    if ($Requested -ne '') {
        $resolved = if ([IO.Path]::IsPathRooted($Requested)) { $Requested } else { Join-Path $projectRoot $Requested }
        if (!(Test-Path -LiteralPath $resolved -PathType Leaf)) {
            throw "Env file not found: $resolved"
        }
        return $resolved
    }
    $candidates = @('.env', '.env.all', '.env.local') | ForEach-Object { Join-Path $projectRoot $_ }
    $found = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if (!$found) {
        $targetEnv = Join-Path $projectRoot '.env'
        $examplePath = Join-Path $projectRoot '.env.example'
        if (Test-Path -LiteralPath $examplePath -PathType Leaf) {
            Copy-Item -LiteralPath $examplePath -Destination $targetEnv
            throw "Chua co file .env. Da tao mau tai '$targetEnv' tu .env.example - hay dien cac key can thiet roi chay lai script."
        }
        throw 'Khong tim thay file .env.'
    }
    return $found
}

function Sync-ConsolidatedEnv([string]$SourceFile) {
    Write-Host "[Env] Reading env from: $SourceFile"
    $inputEnv = Read-EnvMap $SourceFile

    $rootTarget = Join-Path $projectRoot '.env'
    $allKnownKeys = @($rootEnvKeys + $backendEnvKeys + $frontendEnvKeys | Select-Object -Unique)

    $rootUpdates = [ordered]@{}
    foreach ($k in $allKnownKeys) {
        if ($inputEnv.Contains($k)) { $rootUpdates[$k] = $inputEnv[$k] }
    }

    $existingRoot = Read-EnvMap $rootTarget
    $aiKey = ''
    foreach ($candidateKey in @($inputEnv['AI_SERVICE_KEY'], $existingRoot['AI_SERVICE_KEY'])) {
        if ($candidateKey -and $candidateKey.Trim() -ne '') {
            $aiKey = $candidateKey.Trim()
            break
        }
    }
    if ($aiKey -eq '') {
        $bytes = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $aiKey = -join ($bytes | ForEach-Object { $_.ToString('x2') })
        Write-Host '  Generated new AI_SERVICE_KEY.'
    }
    $rootUpdates['AI_SERVICE_KEY'] = $aiKey
    if (!$rootUpdates.Contains('AI_ENABLED') -and !$existingRoot.Contains('AI_ENABLED')) {
        $rootUpdates['AI_ENABLED'] = 'true'
    }

    $frontendUpdated = $false
    foreach ($fk in $frontendEnvKeys) {
        if ($inputEnv.Contains($fk) -and $existingRoot[$fk] -ne $inputEnv[$fk]) {
            $frontendUpdated = $true
            break
        }
    }

    $sameFile = ((Resolve-Path -LiteralPath $SourceFile).Path -ieq $rootTarget)
    if (!$sameFile -or !$existingRoot.Contains('AI_SERVICE_KEY') -or $existingRoot['AI_SERVICE_KEY'] -ne $aiKey) {
        Write-MergedEnvFile $rootTarget $rootUpdates '# Single consolidated .env (managed by start-app.ps1; do not commit)'
    }

    Write-Host '  Active env file -> ./.env'
    return @{
        AiKey           = $aiKey
        FrontendUpdated = $frontendUpdated
    }
}

function Ensure-DockerReady([bool]$StartIfStopped) {
    $docker = Find-Executable 'docker.exe' @(
        "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe",
        "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe"
    )
    if (!$docker) { throw 'Cannot find docker.exe. Install Docker Desktop first.' }

    $dockerReady = { & $docker info --format '{{.ServerVersion}}' 2>$null | Out-Null; return $LASTEXITCODE -eq 0 }
    $ready = $false
    try { $ready = & $dockerReady } catch { }
    if (!$ready) {
        if (!$StartIfStopped) {
            throw 'Docker Desktop is not running.'
        }
        $desktop = Find-Executable 'Docker Desktop.exe' @(
            "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
            "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
        )
        if (!$desktop) { throw 'Docker Desktop is not running and could not be located.' }
        Write-Host '  Starting Docker Desktop...'
        Start-Process -FilePath $desktop -WindowStyle Hidden
        Wait-Ready 'Docker Desktop' $dockerReady 180
    }
    & $docker compose version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose is unavailable.' }
    return $docker
}

function Resolve-StackConfig([System.Collections.IDictionary]$EffectiveRoot, [bool]$RequireOllamaRunning) {
    $useOllama = $false
    $bundleRel = if ($EffectiveRoot['CINEMA_AI_BUNDLE_DIR']) { $EffectiveRoot['CINEMA_AI_BUNDLE_DIR'] } else { 'local-ai-tuning/workspace/chatbot-bundle' }
    $bundlePath = if ([IO.Path]::IsPathRooted($bundleRel)) { $bundleRel } else { Join-Path $projectRoot $bundleRel }
    $manifestPath = Join-Path $bundlePath 'manifest.json'

    if (!$NoOllama -and (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        $ollama = Find-Executable 'ollama.exe' @("$env:LOCALAPPDATA\Programs\Ollama\ollama.exe")
        if ($ollama) {
            if ($RequireOllamaRunning) {
                Write-Host '[Ollama] Checking Ollama & trained AI bundle...'
                $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
                $ollamaReady = { $null = Invoke-RestMethod 'http://localhost:11434/api/tags' -TimeoutSec 3; return $true }
                $oReady = $false
                try { $oReady = & $ollamaReady } catch { }
                if (!$oReady) {
                    Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden
                    Wait-Ready 'Ollama' $ollamaReady 90
                }
                $tags = Invoke-RestMethod 'http://localhost:11434/api/tags' -TimeoutSec 5
                $encoders = @($manifest.artifacts.PSObject.Properties | ForEach-Object { $_.Value.metadata.encoder } | Where-Object { $_ } | Sort-Object -Unique)
                foreach ($encoder in $encoders) {
                    if ($encoder -notin @($tags.models | ForEach-Object { $_.name })) {
                        Write-Host "  Pulling Ollama model $encoder..."
                        & $ollama pull $encoder
                        if ($LASTEXITCODE -ne 0) { throw "Cannot download Ollama model $encoder." }
                    }
                }
            }
            $env:CINEMA_AI_BUNDLE_DIR = (Resolve-Path -LiteralPath $bundlePath).Path.Replace('\', '/')
            $useOllama = $true
        } elseif ($RequireOllamaRunning) {
            Write-Host '[Ollama] Not found; starting AI service without Ollama encoder.' -ForegroundColor Yellow
        }
    }

    $aiKey = $EffectiveRoot['AI_SERVICE_KEY']
    if (!$aiKey) { $aiKey = 'placeholder-for-compose-control' }
    $env:AI_SERVICE_KEY = $aiKey

    $composeFiles = @('compose', '-f', 'docker.yml', '-f', 'docker-compose.ai.yml')
    if ($useOllama) {
        $composeFiles += @('-f', 'docker-compose.ollama.yml')
    }

    $useNgrok = $false
    $ngrokToken = $EffectiveRoot['NGROK_AUTHTOKEN']
    $ngrokDomain = $EffectiveRoot['NGROK_DOMAIN']
    if (!$NoNgrok -and $ngrokToken -and $ngrokDomain) {
        if ($ngrokDomain.StartsWith('rd_')) {
            if ($RequireOllamaRunning) {
                Write-Host "  Warning: NGROK_DOMAIN='$ngrokDomain' looks like a Domain ID (rd_...), skipping ngrok." -ForegroundColor Yellow
            }
        } else {
            $env:NGROK_AUTHTOKEN = $ngrokToken
            $env:NGROK_DOMAIN = $ngrokDomain
            $composeFiles += @('-f', 'docker-compose.ngrok.yml')
            $useNgrok = $true
        }
    }

    return @{
        ComposeFiles = $composeFiles
        UseOllama    = $useOllama
        UseNgrok     = $useNgrok
        NgrokDomain  = $ngrokDomain
        ManifestPath = $manifestPath
    }
}

function Stop-ConflictingRepoStack([string]$Docker, [string]$CurrentProjectName) {
    foreach ($container in @('galaxy_cinema_db', 'galaxy_cinema_app', 'galaxy_cinema_frontend', 'galaxy_cinema_ngrok')) {
        $raw = & $Docker ps -a --filter "name=^/$container`$" --format '{{.Names}}'
        if ($raw) {
            $owner = (& $Docker inspect $container | ConvertFrom-Json)[0].Config.Labels.'com.docker.compose.project'
            if ($owner -and $owner -ne $CurrentProjectName) {
                if ($owner -in @('galaxy-cinema-local', 'cinema-booking-system-with-ai')) {
                    Write-Host "  Stopping previous repo stack '$owner' to avoid container name conflict..."
                    & $Docker compose -p $owner down
                } else {
                    throw "$container belongs to unrelated Docker project '$owner'. Stop it manually first."
                }
            }
        }
    }
}

function Wait-AndVerifyApp([string]$Docker, [hashtable]$Stack, [System.Collections.IDictionary]$EffectiveRoot, [System.Collections.IDictionary]$EffectiveBackend) {
    Write-Host '[Verify] Waiting for services to become ready...'
    $apiPort = if ($EffectiveRoot['CINEMA_API_PORT']) { $EffectiveRoot['CINEMA_API_PORT'] } else { '8000' }
    $webPort = if ($EffectiveRoot['CINEMA_WEB_PORT']) { $EffectiveRoot['CINEMA_WEB_PORT'] } else { '8080' }
    $apiUrl = "http://localhost:$apiPort"

    $aiContainer = (& $Docker @($Stack.ComposeFiles + @('--profile', 'ai', 'ps', '-q', 'ai')) | Select-Object -First 1)
    if ($aiContainer) {
        $aiContainer = $aiContainer.Trim()
        Wait-Ready 'AI service' {
            & $Docker exec $aiContainer python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=3)" 2>$null | Out-Null
            return $LASTEXITCODE -eq 0
        } 120
    }

    Wait-Ready 'Backend & Database' {
        $health = Invoke-RestMethod "$apiUrl/api/health" -TimeoutSec 5
        return $health.success -eq $true
    } 180

    if ($Stack.UseOllama -and (Test-Path -LiteralPath $Stack.ManifestPath -PathType Leaf)) {
        $manifest = Get-Content -LiteralPath $Stack.ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $encoders = @($manifest.artifacts.PSObject.Properties | ForEach-Object { $_.Value.metadata.encoder } | Where-Object { $_ } | Sort-Object -Unique)
        foreach ($encoder in $encoders) {
            $embedBody = @{ model = $encoder; input = 'cinema'; keep_alive = '10m'; options = @{ num_ctx = 512 } } | ConvertTo-Json -Depth 3
            $null = Invoke-RestMethod 'http://localhost:11434/api/embed' -Method Post -ContentType 'application/json' -Body $embedBody -TimeoutSec 120
        }
    }

    $chatCheck = Invoke-RestMethod "$apiUrl/api/ai/chat" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes('{"message":"Lich chieu hom nay"}')) -TimeoutSec 30
    if (!$chatCheck.success -or !$chatCheck.data.ai_available) {
        Write-Host "  Warning: /api/ai/chat responded with ai_available=$($chatCheck.data.ai_available)." -ForegroundColor Yellow
    }

    $webUrl = "http://localhost:$webPort"
    Wait-Ready 'Frontend' {
        $res = Invoke-WebRequest $webUrl -UseBasicParsing -TimeoutSec 5
        return $res.StatusCode -eq 200
    } 300
    Write-Progress -Activity 'Frontend' -Completed

    Write-Host "`nApplication is ready!" -ForegroundColor Green
    Write-Host "  Frontend : $webUrl"
    Write-Host "  API      : $apiUrl/api/health"
    Write-Host "  AI chat  : ai_available=$($chatCheck.data.ai_available)"
    if ($Stack.UseNgrok) {
        Write-Host "  Ngrok    : https://$($Stack.NgrokDomain)"
        if ($EffectiveBackend['APP_URL'] -notlike "*$($Stack.NgrokDomain)*") {
            Write-Host "  Note: Update APP_URL & FRONTEND_URL to https://$($Stack.NgrokDomain) for QR payment callbacks." -ForegroundColor Yellow
        }
    }

    if (!$NoBrowser) {
        Start-Process $webUrl
    }
}

Push-Location $projectRoot
try {
    if ($SyncEnvOnly) {
        $Action = 'sync'
    } elseif ($Action -eq '' -or $Action -eq 'menu') {
        $Action = Select-ActionFromMenu
        if ($Action -eq '') {
            Write-Host 'Da thoat.'
            return
        }
    }

    $currentProjectName = (Split-Path -Leaf $projectRoot).ToLowerInvariant() -replace '[^a-z0-9_-]', ''
    $rootTarget = Join-Path $projectRoot '.env'

    if ($Action -eq 'sync') {
        $sourceEnv = Resolve-InputEnvFile $EnvFile
        $null = Sync-ConsolidatedEnv $sourceEnv
        Write-Host 'Sync completed.' -ForegroundColor Green
        return
    }

    if ($Action -in @('status', 'pause', 'unpause', 'stop')) {
        $docker = Ensure-DockerReady $false
        $effectiveRoot = Read-EnvMap $rootTarget
        $stack = Resolve-StackConfig $effectiveRoot ($Action -eq 'unpause')
        $baseArgs = $stack.ComposeFiles + @('--profile', 'ai')

        switch ($Action) {
            'status' {
                & $docker @($baseArgs + @('ps', '-a'))
            }
            'pause' {
                Write-Host '[Pause] Pausing running containers...'
                & $docker @($baseArgs + @('pause'))
                if ($LASTEXITCODE -ne 0) { throw 'Failed to pause containers.' }
                & $docker @($baseArgs + @('ps', '-a'))
            }
            'unpause' {
                Write-Host '[Unpause] Resuming paused containers...'
                & $docker @($baseArgs + @('unpause'))
                if ($LASTEXITCODE -ne 0) { throw 'Failed to unpause containers.' }
                & $docker @($baseArgs + @('ps', '-a'))
            }
            'stop' {
                Write-Host '[Stop] Stopping containers (keeping DB volume & containers)...'
                & $docker @($baseArgs + @('stop'))
                if ($LASTEXITCODE -ne 0) { throw 'Failed to stop containers.' }
                & $docker @($baseArgs + @('ps', '-a'))
            }
        }
        return
    }

    if ($Action -eq 'start') {
        $docker = Ensure-DockerReady $true
        $effectiveRoot = Read-EnvMap $rootTarget
        $stack = Resolve-StackConfig $effectiveRoot $true
        $baseArgs = $stack.ComposeFiles + @('--profile', 'ai')

        $existingIds = @(& $docker @($baseArgs + @('ps', '-a', '-q')) | Where-Object { $_.Trim() -ne '' })
        if ($existingIds.Count -eq 0) {
            Write-Host '[Start] Chua co container nao duoc tao. Chuyen sang che do up (dung image da build san)...' -ForegroundColor Yellow
            $Action = 'up'
        } else {
            Write-Host '[Start] Starting existing containers (no rebuild)...'
            $pausedIds = @(& $docker @($baseArgs + @('ps', '--status', 'paused', '-q')) | Where-Object { $_.Trim() -ne '' })
            if ($pausedIds.Count -gt 0) {
                Write-Host '  Detected paused containers -> unpausing first...'
                & $docker @($baseArgs + @('unpause'))
                if ($LASTEXITCODE -ne 0) { throw 'Failed to unpause containers.' }
            }
            & $docker @($baseArgs + @('start'))
            if ($LASTEXITCODE -ne 0) { throw 'Failed to start existing containers.' }
            Wait-AndVerifyApp $docker $stack $effectiveRoot $effectiveRoot
            return
        }
    }

    # Actions that sync env and bring up stack: up (prebuilt), rebuild (build & recreate), reset (wipe DB + fresh build)
    if ($Action -eq 'reset' -and !$Force) {
        $confirm = (Read-Host 'Canh bao: Reset se XOA toan bo container va du lieu DB (mysql_data) de chay lai tu dau. Tiep tuc? (y/N)').Trim()
        if ($confirm -notin @('y', 'Y', 'yes', 'YES')) {
            Write-Host 'Da huy thao tac reset.'
            return
        }
    }

    $sourceEnv = Resolve-InputEnvFile $EnvFile
    $syncInfo = Sync-ConsolidatedEnv $sourceEnv
    $effectiveRoot = Read-EnvMap $rootTarget
    $effectiveBackend = $effectiveRoot

    $docker = Ensure-DockerReady $true
    Stop-ConflictingRepoStack $docker $currentProjectName
    $stack = Resolve-StackConfig $effectiveRoot $true
    $baseArgs = $stack.ComposeFiles + @('--profile', 'ai')

    if ($Action -eq 'reset') {
        Write-Host '[Reset] Removing containers and DB volume...'
        & $docker @($baseArgs + @('down', '-v', '--remove-orphans'))
        if ($LASTEXITCODE -ne 0) { throw 'Failed to remove containers/volumes during reset.' }
    }

    $services = @('db', 'ai', 'app', 'frontend')
    if ($stack.UseNgrok) { $services += 'ngrok' }

    if ($Action -eq 'up') {
        # Use pre-built images when available; build only if local images do not exist yet
        $hasAppImg = $false
        $hasAiImg = $false
        & $docker image inspect "${currentProjectName}-app" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $hasAppImg = $true }
        & $docker image inspect "${currentProjectName}-ai" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $hasAiImg = $true }

        $upFlags = @('up', '-d')
        if ($hasAppImg -and $hasAiImg) {
            Write-Host '[Up] Running from pre-built images (--no-build)...'
            $upFlags += '--no-build'
        } elseif ($NoBuild) {
            throw 'Pre-built images not found locally and -NoBuild was set. Run with action "rebuild" first.'
        } else {
            Write-Host '[Up] Pre-built images not found yet; building once...' -ForegroundColor Yellow
            $upFlags += '--build'
        }

        & $docker @($baseArgs + $upFlags + $services)
        if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed to start services.' }
        if ($syncInfo.FrontendUpdated) {
            & $docker @($baseArgs + @('restart', 'frontend')) | Out-Null
        }
    } elseif ($Action -eq 'rebuild') {
        Write-Host '[Rebuild] Rebuilding images & recreating containers (keeping DB volume)...'
        $upFlags = @('up', '-d', '--force-recreate')
        if (!$NoBuild) { $upFlags += '--build' }
        & $docker @($baseArgs + $upFlags + @('app', 'ai'))
        if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed to rebuild app/ai.' }

        $otherServices = @('db', 'frontend')
        if ($stack.UseNgrok) { $otherServices += 'ngrok' }
        & $docker @($baseArgs + $upFlags + $otherServices)
        if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed to rebuild db/frontend/ngrok.' }
    } elseif ($Action -eq 'reset') {
        Write-Host '[Reset] Building & starting fresh stack from scratch...'
        $upFlags = @('up', '-d')
        if (!$NoBuild) { $upFlags += '--build' }
        & $docker @($baseArgs + $upFlags + $services)
        if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed to start fresh stack.' }
    }

    Wait-AndVerifyApp $docker $stack $effectiveRoot $effectiveBackend
} finally {
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
    Pop-Location
}
