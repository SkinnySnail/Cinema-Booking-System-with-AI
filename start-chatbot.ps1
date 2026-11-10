# Run from any directory. Requires Docker Desktop, Ollama and a trained bundle.
# .\start-chatbot.ps1 [-NoBrowser] [-NoBuild] [-SeedShowtimes]
[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int]$WebPort = 8081,
    [ValidateRange(1024, 65535)][int]$ApiPort = 8000,
    [ValidateRange(1024, 65535)][int]$DatabasePort = 3308,
    [string]$BundleDirectory = 'local-ai-tuning/workspace/chatbot-bundle',
    [switch]$NoBrowser,
    [switch]$NoBuild,
    [switch]$SeedShowtimes
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$projectName = 'galaxy-cinema-local'
$savedEnvironment = @{}
foreach ($name in @('AI_SERVICE_KEY', 'CINEMA_WEB_PORT', 'CINEMA_API_PORT', 'CINEMA_DB_PORT', 'CINEMA_AI_BUNDLE_DIR')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

function Find-Executable([string]$Name, [string[]]$Candidates) {
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    foreach ($candidate in $Candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    throw "Cannot find $Name. Install it and run this script again."
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

Push-Location $projectRoot
try {
    if (@($WebPort, $ApiPort, $DatabasePort | Select-Object -Unique).Count -ne 3) {
        throw 'Choose different ports for the website, API and database.'
    }
    $docker = Find-Executable 'docker.exe' @(
        "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe",
        "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe"
    )
    $ollama = Find-Executable 'ollama.exe' @("$env:LOCALAPPDATA\Programs\Ollama\ollama.exe")

    Write-Host '[1/6] Checking trained artifacts...'
    if (![IO.Path]::IsPathRooted($BundleDirectory)) { $BundleDirectory = Join-Path $projectRoot $BundleDirectory }
    $bundle = (Resolve-Path -LiteralPath $BundleDirectory).Path
    $manifest = Get-Content -LiteralPath (Join-Path $bundle 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($task in @('intent', 'sentiment', 'recommendation')) {
        if (!$manifest.artifacts.PSObject.Properties[$task]) { throw "Bundle is missing $task." }
    }
    foreach ($entry in $manifest.artifacts.PSObject.Properties) {
        $file = Join-Path $bundle $entry.Value.file
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value.sha256) {
            throw "Artifact checksum failed: $($entry.Name)"
        }
    }

    Write-Host '[2/6] Starting Docker Desktop if needed...'
    $dockerReady = { & $docker info --format '{{.ServerVersion}}' 2>$null | Out-Null; return $LASTEXITCODE -eq 0 }
    $ready = $false
    try { $ready = & $dockerReady } catch { }
    if (!$ready) {
        $desktop = Find-Executable 'Docker Desktop.exe' @(
            "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
            "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
        )
        Start-Process -FilePath $desktop -WindowStyle Hidden
        Wait-Ready 'Docker Desktop' $dockerReady 180
    }
    & $docker compose version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose is unavailable.' }

    # Fixed container names in docker.yml must belong to the same local project.
    foreach ($container in @('galaxy_cinema_db', 'galaxy_cinema_app', 'galaxy_cinema_frontend')) {
        $raw = & $docker ps -a --filter "name=^/$container`$" --format '{{.Names}}'
        if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect existing containers.' }
        if ($raw) {
            $owner = (& $docker inspect $container | ConvertFrom-Json)[0].Config.Labels.'com.docker.compose.project'
            if ($owner -ne $projectName) {
                throw "$container belongs to another Docker project. It has been left unchanged."
            }
        }
    }
    if (!$env:AI_SERVICE_KEY) {
        $aiName = & $docker ps -a --filter "name=^/$projectName-ai-1`$" --format '{{.Names}}'
        if ($aiName) {
            $existing = (& $docker inspect "$projectName-ai-1" | ConvertFrom-Json)[0]
            $keyEntry = $existing.Config.Env | Where-Object { $_.StartsWith('AI_SERVICE_KEY=') } | Select-Object -First 1
            if ($keyEntry) { $env:AI_SERVICE_KEY = $keyEntry.Substring('AI_SERVICE_KEY='.Length) }
        }
        if (!$env:AI_SERVICE_KEY) {
            $bytes = New-Object byte[] 32
            $random = [Security.Cryptography.RandomNumberGenerator]::Create()
            try { $random.GetBytes($bytes) } finally { $random.Dispose() }
            $env:AI_SERVICE_KEY = -join ($bytes | ForEach-Object { $_.ToString('x2') })
        }
    }
    $env:CINEMA_WEB_PORT = "$WebPort"
    $env:CINEMA_API_PORT = "$ApiPort"
    $env:CINEMA_DB_PORT = "$DatabasePort"
    $env:CINEMA_AI_BUNDLE_DIR = $bundle.Replace('\', '/')

    Write-Host '[3/6] Checking local Ollama models...'
    $ollamaReady = { $null = Invoke-RestMethod 'http://localhost:11434/api/tags' -TimeoutSec 3; return $true }
    $ready = $false
    try { $ready = & $ollamaReady } catch { }
    if (!$ready) {
        Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden
        Wait-Ready 'Ollama' $ollamaReady 90
    }
    $tags = Invoke-RestMethod 'http://localhost:11434/api/tags' -TimeoutSec 5
    $encoders = @($manifest.artifacts.PSObject.Properties | ForEach-Object { $_.Value.metadata.encoder } | Where-Object { $_ } | Sort-Object -Unique)
    foreach ($encoder in $encoders) {
        if ($encoder -notin @($tags.models | ForEach-Object { $_.name })) {
            Write-Host "Downloading $encoder..."
            & $ollama pull $encoder
            if ($LASTEXITCODE -ne 0) { throw "Cannot download $encoder." }
        }
    }

    Write-Host '[4/6] Starting database, AI, backend and website...'
    $compose = @('compose', '-p', $projectName, '-f', 'docker.yml', '-f', 'docker-compose.ai.yml', '-f', 'docker-compose.ollama.yml', '--profile', 'ai')
    $up = @('up', '-d')
    if (!$NoBuild) { $up += '--build' }
    & $docker @compose @up db ai app frontend
    if ($LASTEXITCODE -ne 0) { throw 'Docker startup failed. Check the output above for a port conflict or build error.' }
    Wait-Ready 'AI service' {
        & $docker exec "$projectName-ai-1" python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=3)" 2>$null | Out-Null
        return $LASTEXITCODE -eq 0
    } 120
    $apiUrl = "http://localhost:$ApiPort"
    Wait-Ready 'Backend and database' {
        $check = Invoke-RestMethod "$apiUrl/api/movies?limit=1" -TimeoutSec 5
        return $check.success -eq $true
    } 180
    if ($SeedShowtimes) {
        & $docker exec galaxy_cinema_app php backend/scripts/seed_revival_showtimes.php --apply
        if ($LASTEXITCODE -ne 0) { throw 'Showtime seed failed.' }
    }

    Write-Host '[5/6] Verifying and warming the trained models...'
    # Runs inside the exact serving environment. Checks digests, dimensions and heads.
    $warmup = @'
import os
from model_bundle import ModelBundle
from ollama_adapter import OllamaClassifier, OllamaEmbeddings
bundle = ModelBundle(os.environ['AI_MODEL_DIR'])
for task in ('intent', 'sentiment'):
    artifact = bundle.get(task)
    classifier = OllamaClassifier(artifact['estimator'], artifact['ollama'])
    classifier.predict_proba(['cinema'])
    print(task + ': ' + classifier.name, flush=True)
OllamaEmbeddings(bundle.get('recommendation')['ollama']).encode(['cinema'], catalog=True)
print('Bundle ' + bundle.identifier + ' verified.', flush=True)
'@
    # Cold model loading can take longer than an interactive chat request budget.
    foreach ($encoder in $encoders) {
        $body = @{ model=$encoder; input='cinema'; keep_alive='10m'; options=@{num_ctx=512} } | ConvertTo-Json -Depth 3
        $null = Invoke-RestMethod 'http://localhost:11434/api/embed' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 120
    }
    & $docker exec "$projectName-ai-1" python -c $warmup
    if ($LASTEXITCODE -ne 0) { throw 'Trained model verification failed. Check Ollama connectivity and matching model digests.' }
    $body = @{ message='Lich chieu ngay mai' } | ConvertTo-Json
    $chat = Invoke-RestMethod "$apiUrl/api/ai/chat" -Method Post -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 30
    if (!$chat.success -or !$chat.data.ai_available -or $chat.data.intent_model -notlike 'ollama/*') {
        throw 'Chatbot is using a fallback or cannot reach the tuned models. Inspect AI container logs.'
    }

    Write-Host '[6/6] Waiting for the website build...'
    $webUrl = "http://localhost:$WebPort/?chat=1"
    Wait-Ready 'Website' {
        $response = Invoke-WebRequest "http://localhost:$WebPort" -UseBasicParsing -TimeoutSec 5
        return $response.StatusCode -eq 200
    } 300
    Write-Progress -Activity 'Website' -Completed
    Write-Host "`nChatbot ready: $webUrl" -ForegroundColor Green
    Write-Host "Intent model: $($chat.data.intent_model)"
    Write-Host 'Leave Docker Desktop and Ollama running while using the website.'
    if (!$NoBrowser) { Start-Process $webUrl }
} finally {
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
    Pop-Location
}
