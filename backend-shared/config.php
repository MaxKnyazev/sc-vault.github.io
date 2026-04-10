<?php

declare(strict_types=1);

$authTokenTtlSeconds = 60 * 60 * 24 * 30;
if ($authTokenTtlSeconds < 300) {
    $authTokenTtlSeconds = 300;
}

return [
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'u3475945_sctool_api',
    'db_user' => 'u3475945_sctool_api_user',
    'db_pass' => 'Ahfth3120++',
    // Comma-separated origins, e.g.: https://sctool.ru,https://www.sctool.ru
    'app_allowed_origin' => 'https://sctool.ru,https://www.sctool.ru',
    'auth_token_ttl_seconds' => $authTokenTtlSeconds,
    'auction_window_hours' => 12,
    'auction_region' => 'ru',
    'auction_api_base_url' => 'https://eapi.stalcraft.net',
    'exbo_client_id' => '2471',
    'exbo_client_secret' => 'cDOwwoKwdQwvQQGwcZMHcSECxvJEInJEfXETvCZq',
];
