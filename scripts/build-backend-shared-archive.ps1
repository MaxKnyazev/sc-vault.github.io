$ErrorActionPreference = "Stop"

$root = Resolve-Path "."
$outDir = Join-Path $root "dist-deploy"
$stageDir = Join-Path $outDir "api-sctool-ru"
$zipPath = Join-Path $outDir "api-sctool-ru.zip"

if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

New-Item -ItemType Directory -Path $stageDir | Out-Null

# Root files
Copy-Item "backend-shared/public/index.php" (Join-Path $stageDir "index.php")
Copy-Item "backend-shared/config.php" (Join-Path $stageDir "config.php")
Copy-Item "backend-shared/config.example.php" (Join-Path $stageDir "config.example.php")

# Required directories
Copy-Item "backend-shared/src" (Join-Path $stageDir "src") -Recurse
Copy-Item "backend-shared/cron" (Join-Path $stageDir "cron") -Recurse
Copy-Item "backend-shared/migrations" (Join-Path $stageDir "migrations") -Recurse
Copy-Item "backend-shared/docs" (Join-Path $stageDir "docs") -Recurse

Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -Force

Write-Host "Archive created: $zipPath" -ForegroundColor Green

