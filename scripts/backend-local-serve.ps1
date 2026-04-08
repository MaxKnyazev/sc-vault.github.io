$ErrorActionPreference = "Stop"

$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "3307"
$env:DB_NAME = "scvault"
$env:DB_USER = "scvault"
$env:DB_PASS = "scvault"
$env:APP_ALLOWED_ORIGIN = "http://localhost:5173"
$env:EXBO_CLIENT_ID = "2471"
$env:EXBO_CLIENT_SECRET = "cDOwwoKwdQwvQQGwcZMHcSECxvJEInJEfXETvCZq"
$env:AUCTION_REGION = "ru"
$env:AUCTION_API_BASE_URL = "https://eapi.stalcraft.net"
$env:AUCTION_WINDOW_HOURS = "12"

Write-Host "Starting PHP API at http://127.0.0.1:8080 ..." -ForegroundColor Cyan
php -S 127.0.0.1:8080 -t backend-shared/public

