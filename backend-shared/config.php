<?php

$defaults = require __DIR__ . '/config.example.php';

$readEnv = static function (string $key, $fallback = null) {
    $value = getenv($key);
    if ($value === false || $value === '') {
        return $fallback;
    }
    return $value;
};

return [
    'db_host' => $readEnv('DB_HOST', 'localhost'),
    'db_port' => (int)$readEnv('DB_PORT', (string)$defaults['db_port']),
    'db_name' => $readEnv('DB_NAME', 'u3475945_sctool_api'),
    'db_user' => $readEnv('DB_USER', 'u3475945_sctool_api_user'),
    'db_pass' => $readEnv('DB_PASS', 'Ahfth3120++'),
    'app_allowed_origin' => $readEnv('APP_ALLOWED_ORIGIN', 'https://sctool.ru'),
    'auth_token_ttl_seconds' => (int)$readEnv(
        'AUTH_TOKEN_TTL_SECONDS',
        (string)$defaults['auth_token_ttl_seconds']
    ),
    'auction_window_hours' => (int)$readEnv(
        'AUCTION_WINDOW_HOURS',
        (string)$defaults['auction_window_hours']
    ),
    'auction_region' => strtolower((string)$readEnv('AUCTION_REGION', $defaults['auction_region'])),
    'auction_api_base_url' => rtrim(
        (string)$readEnv('AUCTION_API_BASE_URL', $defaults['auction_api_base_url']),
        '/'
    ),
    'exbo_client_id' => (string)$readEnv('EXBO_CLIENT_ID', $defaults['exbo_client_id']),
    'exbo_client_secret' => (string)$readEnv('EXBO_CLIENT_SECRET', $defaults['exbo_client_secret']),
];

