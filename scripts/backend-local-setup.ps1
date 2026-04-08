$ErrorActionPreference = "Stop"

Write-Host "Ensuring local MySQL container exists..." -ForegroundColor Cyan
$exists = docker ps -a --format "{{.Names}}" | Select-String -SimpleMatch "scvault-mysql"
if (-not $exists) {
  docker run --name scvault-mysql `
    -e MYSQL_ROOT_PASSWORD=root `
    -e MYSQL_DATABASE=scvault `
    -e MYSQL_USER=scvault `
    -e MYSQL_PASSWORD=scvault `
    -p 3307:3306 `
    -d mysql:8 | Out-Null
} else {
  docker rm -f scvault-mysql | Out-Null
  docker run --name scvault-mysql `
    -e MYSQL_ROOT_PASSWORD=root `
    -e MYSQL_DATABASE=scvault `
    -e MYSQL_USER=scvault `
    -e MYSQL_PASSWORD=scvault `
    -p 3307:3306 `
    -d mysql:8 | Out-Null
}

Write-Host "Waiting for MySQL to become healthy..." -ForegroundColor Cyan
$maxRetries = 60
for ($i = 0; $i -lt $maxRetries; $i++) {
  $ok = docker exec -e MYSQL_PWD=scvault scvault-mysql mysqladmin ping -h "127.0.0.1" -uscvault --silent 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 1
}
if ($LASTEXITCODE -ne 0) {
  throw "MySQL container did not become ready."
}

Write-Host "Applying SQL migration..." -ForegroundColor Cyan
Get-Content "backend-shared/migrations/001_init.sql" -Raw | docker exec -i scvault-mysql mysql -uscvault -pscvault scvault

Write-Host "Done. MySQL is ready on localhost:3307 (db=scvault user=scvault)." -ForegroundColor Green

