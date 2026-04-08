$ErrorActionPreference = "Stop"

$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "3307"
$env:DB_NAME = "scvault"
$env:DB_USER = "scvault"
$env:DB_PASS = "scvault"
$env:EXBO_CLIENT_ID = "2471"
$env:EXBO_CLIENT_SECRET = "cDOwwoKwdQwvQQGwcZMHcSECxvJEInJEfXETvCZq"
$env:AUCTION_REGION = "ru"
$env:AUCTION_API_BASE_URL = "https://eapi.stalcraft.net"
$env:AUCTION_WINDOW_HOURS = "12"

php backend-shared/cron/update_auction.php

