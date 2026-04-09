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
require $baseDir . '/src/RecipeOverrides.php';

function resolve_allowed_origin_header(array $config): string
{
    $raw = (string)($config['app_allowed_origin'] ?? '');
    $allowedOrigins = array_values(array_filter(array_map('trim', explode(',', $raw))));
    if (count($allowedOrigins) === 0) {
        return '*';
    }

    $requestOrigin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($requestOrigin !== '' && in_array($requestOrigin, $allowedOrigins, true)) {
        return $requestOrigin;
    }

    return $allowedOrigins[0];
}

header('Vary: Origin');
header('Access-Control-Allow-Origin: ' . resolve_allowed_origin_header($config));
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

function role_at_least(array $user, string $requiredRole): bool
{
    return role_level((string)($user['role'] ?? 'blocked')) >= role_level($requiredRole);
}

function enforce_auth_user(array $user): void
{
    if (!role_at_least($user, 'user')) {
        send_json(403, ['error' => 'Недостаточно прав']);
        exit;
    }
}

function rate_limit_key(string $action): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return hash('sha256', $action . '|' . $ip);
}

function enforce_rate_limit(string $action, int $maxAttempts, int $windowSeconds): void
{
    $dir = sys_get_temp_dir() . '/sctool-rate-limit';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }

    $file = $dir . '/' . rate_limit_key($action) . '.json';
    $now = time();
    $state = ['count' => 0, 'resetAt' => $now + $windowSeconds];

    if (is_file($file)) {
        $raw = @file_get_contents($file);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if (is_array($decoded)) {
            $state = [
                'count' => (int)($decoded['count'] ?? 0),
                'resetAt' => (int)($decoded['resetAt'] ?? ($now + $windowSeconds)),
            ];
        }
    }

    if ($state['resetAt'] <= $now) {
        $state = ['count' => 0, 'resetAt' => $now + $windowSeconds];
    }

    if ($state['count'] >= $maxAttempts) {
        send_json(429, ['error' => 'Слишком много попыток, попробуйте позже']);
        exit;
    }

    $state['count'] += 1;
    @file_put_contents($file, json_encode($state));
}

if ($path === '/health') {
    send_json(200, ['ok' => true, 'ts' => gmdate('c')]);
    exit;
}

if ($path === '/auth/register') {
    require_method('POST');
    enforce_rate_limit('auth/register', 20, 60);
    $body = read_json_body();
    $nickname = normalize_nickname((string)($body['nickname'] ?? ''));
    $password = (string)($body['password'] ?? '');
    if (!preg_match('/^[a-zA-Z0-9_]{6,16}$/', $nickname) || strlen($password) < 6) {
        send_json(400, ['error' => 'Invalid nickname or password']);
        exit;
    }
    $exists = find_user_by_nickname($db, $nickname);
    if ($exists) {
        send_json(409, ['error' => 'Nickname already registered']);
        exit;
    }
    $userId = create_user($db, $nickname, $password, 'blocked');
    $token = issue_auth_token($db, $userId, (int)$config['auth_token_ttl_seconds']);
    $user = find_user_by_token($db, $token);
    send_json(201, [
        'token' => $token,
        'user' => [
            'id' => (int)$user['id'],
            'nickname' => (string)$user['nickname'],
            'role' => normalize_user_role((string)$user['role']),
            'avatarUrl' => $user['avatar_url'] ?: null,
        ],
    ]);
    exit;
}

if ($path === '/auth/login') {
    require_method('POST');
    enforce_rate_limit('auth/login', 30, 60);
    $body = read_json_body();
    $nickname = normalize_nickname((string)($body['nickname'] ?? ''));
    $legacyEmail = trim((string)($body['email'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $user = $nickname !== '' ? find_user_by_nickname($db, $nickname) : null;
    if (!$user && $legacyEmail !== '') {
        // Transitional fallback for older accounts that still sign in with email.
        $user = find_user_by_email($db, $legacyEmail);
    }
    if (!$user || !password_verify($password, $user['password_hash'])) {
        send_json(401, ['error' => 'Invalid credentials']);
        exit;
    }
    $token = issue_auth_token($db, (int)$user['id'], (int)$config['auth_token_ttl_seconds']);
    send_json(200, [
        'token' => $token,
        'user' => [
            'id' => (int)$user['id'],
            'nickname' => (string)$user['nickname'],
            'role' => normalize_user_role((string)$user['role']),
            'avatarUrl' => $user['avatar_url'] ?: null,
        ],
    ]);
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
    send_json(200, [
        'user' => [
            'id' => (int)$user['id'],
            'nickname' => (string)$user['nickname'],
            'role' => normalize_user_role((string)$user['role']),
            'avatarUrl' => $user['avatar_url'] ?: null,
        ],
    ]);
    exit;
}

if ($path === '/auth/logout') {
    require_method('POST');
    $token = bearer_token_from_headers();
    if (!$token) {
        send_json(401, ['error' => 'Missing token']);
        exit;
    }
    delete_token($db, $token);
    send_json(200, ['ok' => true]);
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

if ($path === '/recipe-overrides') {
    require_method('GET');
    $items = get_recipe_result_overrides($db);
    send_json(200, ['items' => $items]);
    exit;
}

if ($path === '/admin/recipe-overrides') {
    require_method('POST');
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
    if (!role_at_least($user, 'admin')) {
        send_json(403, ['error' => 'Недостаточно прав']);
        exit;
    }
    $body = read_json_body();
    $recipeId = (string)($body['recipeId'] ?? '');
    $resultItemId = (string)($body['resultItemId'] ?? '');
    $baseAmount = parse_positive_int_or_null($body['baseAmount'] ?? null);
    $bonusAmount = parse_positive_int_or_null($body['bonusAmount'] ?? null);
    try {
        upsert_recipe_result_override(
            $db,
            (int)$user['id'],
            $recipeId,
            $resultItemId,
            $baseAmount,
            $bonusAmount
        );
    } catch (Throwable $e) {
        send_json(400, ['error' => $e->getMessage()]);
        exit;
    }
    send_json(200, ['ok' => true]);
    exit;
}

if ($path === '/admin/recipe-overrides/bulk') {
    require_method('POST');
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
    if (!role_at_least($user, 'admin')) {
        send_json(403, ['error' => 'Недостаточно прав']);
        exit;
    }
    $body = read_json_body();
    $items = $body['items'] ?? null;
    if (!is_array($items)) {
        send_json(400, ['error' => 'items must be array']);
        exit;
    }
    try {
        $count = bulk_upsert_recipe_result_overrides($db, (int)$user['id'], $items);
    } catch (Throwable $e) {
        send_json(400, ['error' => $e->getMessage()]);
        exit;
    }
    send_json(200, ['ok' => true, 'updated' => $count]);
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
    enforce_auth_user($user);
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

