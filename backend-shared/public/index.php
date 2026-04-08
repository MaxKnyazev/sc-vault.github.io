<?php

declare(strict_types=1);

function resolve_api_base_dir(): string
{
    // Layout A (repo): backend-shared/public/index.php with config in parent.
    if (file_exists(__DIR__ . '/../config.php') && is_dir(__DIR__ . '/../src')) {
        return realpath(__DIR__ . '/..') ?: (__DIR__ . '/..');
    }
    // Layout B (shared deploy): index.php at site root with config/src рядом.
    if (file_exists(__DIR__ . '/config.php') && is_dir(__DIR__ . '/src')) {
        return __DIR__;
    }
    throw new RuntimeException('API bootstrap failed: config/src not found');
}

$baseDir = resolve_api_base_dir();
$config = require $baseDir . '/config.php';
require $baseDir . '/src/Db.php';
require $baseDir . '/src/Http.php';
require $baseDir . '/src/Auth.php';
require $baseDir . '/src/Auction.php';
require $baseDir . '/src/UserBuyPrices.php';

header('Access-Control-Allow-Origin: ' . $config['app_allowed_origin']);
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $db = db_connect($config);
} catch (Throwable $e) {
    send_json(500, ['error' => 'DB connection failed']);
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = preg_replace('#^/api#', '', $path) ?: '/';

if ($path === '/health') {
    send_json(200, ['ok' => true, 'ts' => gmdate('c')]);
    exit;
}

if ($path === '/auth/register') {
    require_method('POST');
    $body = read_json_body();
    $email = trim((string)($body['email'] ?? ''));
    $password = (string)($body['password'] ?? '');
    if ($email === '' || strlen($password) < 6) {
        send_json(400, ['error' => 'Invalid email or password']);
        exit;
    }
    $exists = find_user_by_email($db, $email);
    if ($exists) {
        send_json(409, ['error' => 'Email already registered']);
        exit;
    }
    $userId = create_user($db, $email, $password);
    $token = issue_auth_token($db, $userId, (int)$config['auth_token_ttl_seconds']);
    send_json(201, ['token' => $token, 'user' => ['id' => $userId, 'email' => $email]]);
    exit;
}

if ($path === '/auth/login') {
    require_method('POST');
    $body = read_json_body();
    $email = trim((string)($body['email'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $user = find_user_by_email($db, $email);
    if (!$user || !password_verify($password, $user['password_hash'])) {
        send_json(401, ['error' => 'Invalid credentials']);
        exit;
    }
    $token = issue_auth_token($db, (int)$user['id'], (int)$config['auth_token_ttl_seconds']);
    send_json(200, ['token' => $token, 'user' => ['id' => (int)$user['id'], 'email' => $user['email']]]);
    exit;
}

if ($path === '/auth/me') {
    require_method('GET');
    $token = bearer_token_from_headers();
    if (!$token) {
        send_json(401, ['error' => 'Missing token']);
        exit;
    }
    $user = find_user_by_token($db, $token);
    if (!$user) {
        send_json(401, ['error' => 'Invalid token']);
        exit;
    }
    send_json(200, ['user' => ['id' => (int)$user['id'], 'email' => $user['email']]]);
    exit;
}

if ($path === '/auction/stats') {
    require_method('GET');
    $idsRaw = trim((string)($_GET['ids'] ?? ''));
    if ($idsRaw === '') {
        send_json(200, ['items' => []]);
        exit;
    }
    $ids = array_values(array_filter(array_unique(array_map('trim', explode(',', $idsRaw)))));
    $items = get_auction_stats($db, $ids, '12h');
    send_json(200, ['items' => $items]);
    exit;
}

if ($path === '/user/buy-prices') {
    $token = bearer_token_from_headers();
    if (!$token) {
        send_json(401, ['error' => 'Missing token']);
        exit;
    }
    $user = find_user_by_token($db, $token);
    if (!$user) {
        send_json(401, ['error' => 'Invalid token']);
        exit;
    }
    $userId = (int)$user['id'];

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        $prices = get_user_buy_prices($db, $userId);
        send_json(200, ['prices' => $prices]);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $body = read_json_body();
        $itemId = trim((string)($body['itemId'] ?? ''));
        $value = trim((string)($body['value'] ?? ''));
        if ($itemId === '') {
            send_json(400, ['error' => 'itemId required']);
            exit;
        }
        upsert_user_buy_price($db, $userId, $itemId, $value);
        send_json(200, ['ok' => true]);
        exit;
    }

    send_json(405, ['error' => 'Method not allowed']);
    exit;
}

send_json(404, ['error' => 'Not found']);

