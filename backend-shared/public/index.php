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
require $baseDir . '/src/AuctionTrackedItems.php';
require $baseDir . '/src/AuctionTrackedDesiredBuyPrices.php';
require $baseDir . '/src/AuctionTrackedSubscriptions.php';
require $baseDir . '/src/AuctionBlacklist.php';
require $baseDir . '/src/UserBuyPrices.php';
require $baseDir . '/src/UserEnergyBuyPrice.php';
require $baseDir . '/src/DefaultBuyPrices.php';
require $baseDir . '/src/RecipeOverrides.php';
require $baseDir . '/src/CraftOrders.php';

function resolve_allowed_origin_header(array $config): string
{
    $raw = (string)($config['app_allowed_origin'] ?? '');
    $allowedOrigins = array_values(array_filter(array_map('trim', explode(',', $raw))));
    $requestOrigin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));

    if (count($allowedOrigins) === 0) {
        // Browsers reject Access-Control-Allow-Origin: * when the request carries Authorization
        // (preflight must echo a concrete Origin).
        return $requestOrigin !== '' ? $requestOrigin : '*';
    }

    if ($requestOrigin !== '' && in_array($requestOrigin, $allowedOrigins, true)) {
        return $requestOrigin;
    }

    return $allowedOrigins[0];
}

header('Vary: Origin');
header('Access-Control-Allow-Origin: ' . resolve_allowed_origin_header($config));
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token, Accept');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Max-Age: 86400');
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

function api_is_missing_db_table(Throwable $e): bool
{
    $msg = $e->getMessage();
    return str_contains($msg, '1146')
        || str_contains($msg, "doesn't exist")
        || str_contains($msg, 'Base table or view not found');
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
        'user' => format_auth_user_payload($user),
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
        'user' => format_auth_user_payload($user),
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
        'user' => format_auth_user_payload($user),
    ]);
    exit;
}

if ($path === '/user/profile') {
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
    enforce_auth_user($user);
    $body = read_json_body();
    $timezoneOffsetHours = (int)($body['timezoneOffsetHours'] ?? 0);
    $craftBranchLevels = $body['craftBranchLevels'] ?? null;
    $auctionTrackingNotifications = normalize_auction_tracking_notifications($body['auctionTrackingNotifications'] ?? true);
    try {
        update_own_user_preferences($db, (int)$user['id'], $timezoneOffsetHours, is_array($craftBranchLevels) ? $craftBranchLevels : [], $auctionTrackingNotifications);
        $freshUser = find_user_by_token($db, $token);
        if (!$freshUser) {
            throw new RuntimeException('User not found after update');
        }
    } catch (Throwable $e) {
        send_json(400, ['error' => $e->getMessage()]);
        exit;
    }
    send_json(200, ['ok' => true, 'user' => format_auth_user_payload($freshUser)]);
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
    $windowRaw = trim((string)($_GET['window'] ?? '12h'));
    if ($idsRaw === '') {
        send_json(200, ['items' => []]);
        exit;
    }
    $ids = array_values(array_filter(array_unique(array_map('trim', explode(',', $idsRaw)))));
    try {
        $windowName = normalize_window_name($windowRaw);
    } catch (Throwable $e) {
        send_json(400, ['error' => 'Invalid window parameter']);
        exit;
    }
    $idsForStats = filter_item_ids_not_blacklisted($db, $ids);
    $items = count($idsForStats) > 0 ? get_auction_stats($db, $idsForStats, $windowName) : [];
    send_json(200, ['items' => $items]);
    exit;
}

if ($path === '/auction/history') {
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
    enforce_auth_user($user);
    $itemId = trim((string)($_GET['itemId'] ?? ''));
    $range = trim((string)($_GET['range'] ?? '7d'));
    $quality = trim((string)($_GET['quality'] ?? 'all'));
    $zoom = (int)($_GET['zoom'] ?? 1);
    $upgrade = trim((string)($_GET['upgrade'] ?? 'all'));
    try {
        // On every modal open/range switch refresh the latest hour for this item,
        // so charts use the freshest raw trades while still keeping cron as the main collector.
        sync_recent_auction_raw_for_item($db, $config, $itemId, 65, 20);
        $points = get_auction_item_history($db, $itemId, $range, $quality, $zoom, $upgrade);
    } catch (Throwable $e) {
        send_json(400, ['error' => $e->getMessage()]);
        exit;
    }
    send_json(200, ['itemId' => $itemId, 'range' => $range, 'quality' => $quality, 'zoom' => $zoom, 'upgrade' => $upgrade, 'points' => $points]);
    exit;
}

if ($path === '/auction/active-lots') {
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
    enforce_auth_user($user);
    $itemId = trim((string)($_GET['itemId'] ?? ''));
    $limit = (int)($_GET['limit'] ?? 100);
    try {
        $lots = get_auction_item_active_lots($db, $config, $itemId, $limit);
    } catch (Throwable $e) {
        send_json(400, ['error' => $e->getMessage()]);
        exit;
    }
    send_json(200, ['itemId' => $itemId, 'lots' => $lots]);
    exit;
}

if ($path === '/auction/blacklist') {
    require_method('GET');
    $ids = get_auction_blacklist_item_ids($db);
    send_json(200, ['itemIds' => $ids]);
    exit;
}

if ($path === '/auction/tracked-items') {
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
    enforce_auth_user($user);
    $scope = trim((string)($_GET['scope'] ?? 'mine'));
    $migrationsPending = false;
    try {
        if ($scope === 'global') {
            $ids = get_global_tracked_auction_item_ids($db);
        } else {
            $ids = get_user_tracked_auction_item_ids($db, (int)$user['id']);
        }
    } catch (Throwable $e) {
        if (!api_is_missing_db_table($e)) {
            send_json(500, ['error' => $e->getMessage()]);
            exit;
        }
        $ids = [];
        $migrationsPending = true;
    }
    send_json(200, [
        'itemIds' => $ids,
        'scope' => $scope === 'global' ? 'global' : 'mine',
        'migrationsPending' => $migrationsPending,
    ]);
    exit;
}

if ($path === '/auction/tracked-items/add') {
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
    enforce_auth_user($user);
    $body = read_json_body();
    $itemId = trim((string)($body['itemId'] ?? ''));
    $sync = null;
    $result = ['addedGlobal' => false];
    try {
        $result = ensure_tracked_for_user($db, $itemId, (int)$user['id'], (int)$user['id']);
        if ($result['addedGlobal']) {
            $sync = sync_tracked_item_history($db, $config, $itemId);
        }
    } catch (Throwable $e) {
        send_json(400, ['error' => $e->getMessage()]);
        exit;
    }
    send_json(200, [
        'ok' => true,
        'sync' => $sync,
        'subscribedOnly' => !$result['addedGlobal'],
    ]);
    exit;
}

if ($path === '/auction/resolve-item-by-name') {
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
    enforce_auth_user($user);
    $name = trim((string)($_GET['name'] ?? ''));
    try {
        $itemId = resolve_auction_item_id_by_exact_name($name);
    } catch (Throwable $e) {
        send_json(400, ['error' => $e->getMessage()]);
        exit;
    }
    send_json(200, ['itemId' => $itemId]);
    exit;
}

if ($path === '/auction/tracked-items/remove') {
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
    enforce_auth_user($user);
    $body = read_json_body();
    $itemId = trim((string)($body['itemId'] ?? ''));
    $scope = trim((string)($body['scope'] ?? 'my'));
    try {
        if ($scope === 'global') {
            if (!role_at_least($user, 'admin')) {
                send_json(403, ['error' => 'Только администратор может убрать предмет из общего списка']);
                exit;
            }
            remove_global_tracked_admin($db, $itemId);
        } else {
            remove_user_tracked_row($db, (int)$user['id'], $itemId);
        }
    } catch (Throwable $e) {
        send_json(400, ['error' => $e->getMessage()]);
        exit;
    }
    send_json(200, ['ok' => true]);
    exit;
}

if ($path === '/auction/tracked-desired-buy-prices') {
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
        $migrationsPending = false;
        try {
            $prices = get_tracked_desired_buy_prices($db, $userId);
        } catch (Throwable $e) {
            if (!api_is_missing_db_table($e)) {
                send_json(500, ['error' => $e->getMessage()]);
                exit;
            }
            $prices = [];
            $migrationsPending = true;
        }
        send_json(200, [
            'prices' => $prices,
            'migrationsPending' => $migrationsPending,
        ]);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        require_method('POST');
        $body = read_json_body();
        $itemId = trim((string)($body['itemId'] ?? ''));
        $value = trim((string)($body['value'] ?? ''));
        if ($itemId === '') {
            send_json(400, ['error' => 'itemId required']);
            exit;
        }
        try {
            if (!user_has_tracked_item($db, $userId, $itemId)) {
                send_json(400, ['error' => 'Сначала добавьте предмет в «Мои отслеживания»']);
                exit;
            }
            if ($value === '') {
                delete_tracked_desired_buy_price($db, $userId, $itemId);
            } else {
                upsert_tracked_desired_buy_price($db, $userId, $itemId, $value);
            }
        } catch (InvalidArgumentException $e) {
            send_json(400, ['error' => $e->getMessage()]);
            exit;
        } catch (Throwable $e) {
            $msg = $e->getMessage();
            if (str_contains($msg, '1146') || str_contains($msg, "doesn't exist")) {
                send_json(503, [
                    'error' => 'Не найдена таблица в БД. Выполните миграции: 014_auction_tracked_desired_buy_prices.sql и 015_auction_user_tracked_items.sql.',
                ]);
                exit;
            }
            send_json(400, ['error' => $msg]);
            exit;
        }
        send_json(200, ['ok' => true]);
        exit;
    }

    send_json(405, ['error' => 'Method not allowed']);
    exit;
}

if ($path === '/auction/tracked-subscriptions') {
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
        $migrationsPending = false;
        try {
            $subscriptions = get_user_tracked_item_subscriptions($db, $userId);
        } catch (Throwable $e) {
            if (!api_is_missing_db_table($e)) {
                send_json(500, ['error' => $e->getMessage()]);
                exit;
            }
            $subscriptions = [];
            $migrationsPending = true;
        }
        send_json(200, ['subscriptions' => $subscriptions, 'migrationsPending' => $migrationsPending]);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        require_method('POST');
        $body = read_json_body();
        $itemId = trim((string)($body['itemId'] ?? ''));
        $kind = normalize_subscription_kind((string)($body['kind'] ?? ''));
        $quality = normalize_subscription_quality((string)($body['quality'] ?? ''), $kind);
        $range = normalize_subscription_upgrade_range($kind, $body['upgradeMin'] ?? -1, $body['upgradeMax'] ?? -1);
        $priceRaw = (string)($body['desiredBuyPrice'] ?? '');
        try {
            $desired = normalize_subscription_desired_price($priceRaw);
            upsert_user_tracked_item_subscription(
                $db,
                $userId,
                $itemId,
                $kind,
                $quality,
                (int)$range['min'],
                (int)$range['max'],
                $desired,
            );
        } catch (InvalidArgumentException $e) {
            send_json(400, ['error' => $e->getMessage()]);
            exit;
        } catch (Throwable $e) {
            if (api_is_missing_db_table($e)) {
                send_json(503, ['error' => 'Не найдена таблица в БД. Выполните миграцию: 019_auction_user_tracked_item_subscriptions.sql.']);
                exit;
            }
            send_json(400, ['error' => $e->getMessage()]);
            exit;
        }
        send_json(200, ['ok' => true]);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'DELETE') {
        $body = read_json_body();
        try {
            $itemId = trim((string)($body['itemId'] ?? ''));
            $kind = normalize_subscription_kind((string)($body['kind'] ?? ''));
            $quality = normalize_subscription_quality((string)($body['quality'] ?? ''), $kind);
            $range = normalize_subscription_upgrade_range($kind, $body['upgradeMin'] ?? -1, $body['upgradeMax'] ?? -1);
            delete_user_tracked_item_subscription(
                $db,
                $userId,
                $itemId,
                $kind,
                $quality,
                (int)$range['min'],
                (int)$range['max'],
            );
        } catch (InvalidArgumentException $e) {
            send_json(400, ['error' => $e->getMessage()]);
            exit;
        } catch (Throwable $e) {
            if (api_is_missing_db_table($e)) {
                send_json(503, ['error' => 'Не найдена таблица в БД. Выполните миграцию: 019_auction_user_tracked_item_subscriptions.sql.']);
                exit;
            }
            send_json(400, ['error' => $e->getMessage()]);
            exit;
        }
        send_json(200, ['ok' => true]);
        exit;
    }

    send_json(405, ['error' => 'Method not allowed']);
    exit;
}

if ($path === '/auction-blacklist/add') {
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
    $itemId = trim((string)($body['itemId'] ?? ''));
    try {
        add_auction_blacklist_item($db, $itemId, (int)$user['id']);
    } catch (Throwable $e) {
        send_json(400, ['error' => $e->getMessage()]);
        exit;
    }
    send_json(200, ['ok' => true]);
    exit;
}

if ($path === '/auction-blacklist/remove') {
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
    $itemId = trim((string)($body['itemId'] ?? ''));
    try {
        remove_auction_blacklist_item($db, $itemId);
    } catch (Throwable $e) {
        send_json(400, ['error' => $e->getMessage()]);
        exit;
    }
    send_json(200, ['ok' => true]);
    exit;
}

if ($path === '/recipe-overrides') {
    require_method('GET');
    $items = get_recipe_result_overrides($db);
    send_json(200, ['items' => $items]);
    exit;
}

if ($path === '/recipe-overrides/save' || $path === '/admin/recipe-overrides') {
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
    $baseAmount = parse_positive_decimal_or_null($body['baseAmount'] ?? null);
    $bonusAmount = parse_positive_decimal_or_null($body['bonusAmount'] ?? null);
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

if ($path === '/recipe-overrides/bulk-save' || $path === '/admin/recipe-overrides/bulk') {
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
        $prices = get_effective_buy_prices_for_user($db, $userId);
        $energyBuyPrice = get_user_energy_buy_price($db, $userId);
        $payload = ['prices' => $prices, 'energyBuyPrice' => $energyBuyPrice];
        if (role_at_least($user, 'admin')) {
            $payload['defaults'] = get_default_buy_prices($db);
        }
        send_json(200, $payload);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $body = read_json_body();
        $rawDefaultFlag = $body['defaultForAll'] ?? false;
        $defaultForAll = $rawDefaultFlag === true
            || $rawDefaultFlag === 1
            || $rawDefaultFlag === '1'
            || $rawDefaultFlag === 'true';
        if ($defaultForAll) {
            if (!role_at_least($user, 'admin')) {
                send_json(403, ['error' => 'Недостаточно прав']);
                exit;
            }
            $itemId = trim((string)($body['itemId'] ?? ''));
            $value = trim((string)($body['value'] ?? ''));
            if ($itemId === '') {
                send_json(400, ['error' => 'itemId required']);
                exit;
            }
            if ($value === '') {
                delete_default_buy_price($db, $itemId);
            } else {
                upsert_default_buy_price($db, $itemId, $value);
            }
            send_json(200, ['ok' => true]);
            exit;
        }

        $itemId = trim((string)($body['itemId'] ?? ''));
        $value = trim((string)($body['value'] ?? ''));
        if ($itemId === '') {
            send_json(400, ['error' => 'itemId required']);
            exit;
        }
        if ($value === '') {
            delete_user_buy_price($db, $userId, $itemId);
        } else {
            upsert_user_buy_price($db, $userId, $itemId, $value);
        }
        send_json(200, ['ok' => true]);
        exit;
    }

    send_json(405, ['error' => 'Method not allowed']);
    exit;
}

if ($path === '/user/energy-buy-price') {
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
        require_method('GET');
        send_json(200, ['value' => get_user_energy_buy_price($db, $userId)]);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        require_method('POST');
        $body = read_json_body();
        $raw = (string)($body['value'] ?? '');
        try {
            $normalized = normalize_energy_buy_price_input($raw);
        } catch (Throwable $e) {
            send_json(400, ['error' => $e->getMessage()]);
            exit;
        }
        set_user_energy_buy_price($db, $userId, $normalized);
        send_json(200, ['ok' => true]);
        exit;
    }

    send_json(405, ['error' => 'Method not allowed']);
    exit;
}

if ($path === '/user/craft-orders') {
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
        try {
            $orders = list_user_craft_orders_with_lines($db, $userId);
        } catch (Throwable $e) {
            if (api_is_missing_db_table($e)) {
                send_json(200, ['orders' => [], 'migrationsPending' => true]);
                exit;
            }
            send_json(500, ['error' => $e->getMessage()]);
            exit;
        }
        send_json(200, ['orders' => $orders, 'migrationsPending' => false]);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        require_method('POST');
        try {
            $order = create_user_craft_order($db, $userId);
        } catch (Throwable $e) {
            if (api_is_missing_db_table($e)) {
                send_json(503, ['error' => 'Не найдена таблица в БД. Выполните миграцию: 020_user_craft_orders.sql.']);
                exit;
            }
            send_json(400, ['error' => $e->getMessage()]);
            exit;
        }
        send_json(200, ['order' => $order]);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'PATCH') {
        require_method('PATCH');
        $body = read_json_body();
        $orderId = (int)($body['orderId'] ?? 0);
        if ($orderId <= 0) {
            send_json(400, ['error' => 'orderId required']);
            exit;
        }
        $hasTitle = array_key_exists('title', $body);
        $hasDh = array_key_exists('deadlineHours', $body);
        if (!$hasTitle && !$hasDh) {
            send_json(400, ['error' => 'title or deadlineHours required']);
            exit;
        }
        try {
            if ($hasTitle) {
                update_user_craft_order_title($db, $userId, $orderId, (string)($body['title'] ?? ''));
            }
            if ($hasDh) {
                $dh = $body['deadlineHours'];
                if ($dh === null || $dh === '' || $dh === false) {
                    update_user_craft_order_deadline($db, $userId, $orderId, null);
                } else {
                    update_user_craft_order_deadline($db, $userId, $orderId, (int)$dh);
                }
            }
        } catch (InvalidArgumentException $e) {
            send_json(400, ['error' => $e->getMessage()]);
            exit;
        } catch (Throwable $e) {
            if (api_is_missing_db_table($e)) {
                send_json(503, ['error' => 'Не найдена таблица в БД. Выполните миграцию: 020_user_craft_orders.sql.']);
                exit;
            }
            send_json(500, ['error' => $e->getMessage()]);
            exit;
        }
        send_json(200, ['ok' => true]);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'DELETE') {
        require_method('DELETE');
        $body = read_json_body();
        $orderId = (int)($body['orderId'] ?? 0);
        if ($orderId <= 0) {
            send_json(400, ['error' => 'orderId required']);
            exit;
        }
        try {
            delete_user_craft_order($db, $userId, $orderId);
        } catch (InvalidArgumentException $e) {
            send_json(400, ['error' => $e->getMessage()]);
            exit;
        } catch (Throwable $e) {
            if (api_is_missing_db_table($e)) {
                send_json(503, ['error' => 'Не найдена таблица в БД. Выполните миграцию: 020_user_craft_orders.sql.']);
                exit;
            }
            send_json(500, ['error' => $e->getMessage()]);
            exit;
        }
        send_json(200, ['ok' => true]);
        exit;
    }

    send_json(405, ['error' => 'Method not allowed']);
    exit;
}

if ($path === '/user/craft-order-lines') {
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

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        require_method('POST');
        $body = read_json_body();
        $orderId = (int)($body['orderId'] ?? 0);
        $recipeFavoriteId = (string)($body['recipeFavoriteId'] ?? '');
        $quantity = (int)($body['quantity'] ?? 1);
        if ($orderId <= 0) {
            send_json(400, ['error' => 'orderId required']);
            exit;
        }
        try {
            $lineId = add_user_craft_order_line($db, $userId, $orderId, $recipeFavoriteId, $quantity);
        } catch (InvalidArgumentException $e) {
            send_json(400, ['error' => $e->getMessage()]);
            exit;
        } catch (Throwable $e) {
            if (api_is_missing_db_table($e)) {
                send_json(503, ['error' => 'Не найдена таблица в БД. Выполните миграцию: 020_user_craft_orders.sql.']);
                exit;
            }
            send_json(500, ['error' => $e->getMessage()]);
            exit;
        }
        send_json(200, ['lineId' => $lineId]);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'PATCH') {
        require_method('PATCH');
        $body = read_json_body();
        $lineId = (int)($body['lineId'] ?? 0);
        if ($lineId <= 0) {
            send_json(400, ['error' => 'lineId required']);
            exit;
        }
        $hasQty = array_key_exists('quantity', $body);
        $hasDone = array_key_exists('done', $body);
        if (!$hasQty && !$hasDone) {
            send_json(400, ['error' => 'quantity or done required']);
            exit;
        }
        try {
            if ($hasQty) {
                update_user_craft_order_line_quantity($db, $userId, $lineId, (int)$body['quantity']);
            }
            if ($hasDone) {
                $raw = $body['done'];
                $done = $raw === true || $raw === 1 || $raw === '1' || $raw === 'true';
                update_user_craft_order_line_done($db, $userId, $lineId, $done);
            }
        } catch (InvalidArgumentException $e) {
            send_json(400, ['error' => $e->getMessage()]);
            exit;
        } catch (Throwable $e) {
            if (api_is_missing_db_table($e)) {
                send_json(503, ['error' => 'Не найдена таблица в БД. Выполните миграцию: 020_user_craft_orders.sql.']);
                exit;
            }
            send_json(500, ['error' => $e->getMessage()]);
            exit;
        }
        send_json(200, ['ok' => true]);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'DELETE') {
        require_method('DELETE');
        $body = read_json_body();
        $lineId = (int)($body['lineId'] ?? 0);
        if ($lineId <= 0) {
            send_json(400, ['error' => 'lineId required']);
            exit;
        }
        try {
            delete_user_craft_order_line($db, $userId, $lineId);
        } catch (InvalidArgumentException $e) {
            send_json(400, ['error' => $e->getMessage()]);
            exit;
        } catch (Throwable $e) {
            if (api_is_missing_db_table($e)) {
                send_json(503, ['error' => 'Не найдена таблица в БД. Выполните миграцию: 020_user_craft_orders.sql.']);
                exit;
            }
            send_json(500, ['error' => $e->getMessage()]);
            exit;
        }
        send_json(200, ['ok' => true]);
        exit;
    }

    send_json(405, ['error' => 'Method not allowed']);
    exit;
}

if ($path === '/user/craft-order-ingredients') {
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

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'PATCH') {
        require_method('PATCH');
        $body = read_json_body();
        $orderId = (int)($body['orderId'] ?? 0);
        $itemId = (string)($body['itemId'] ?? '');
        if ($orderId <= 0) {
            send_json(400, ['error' => 'orderId required']);
            exit;
        }
        if (!array_key_exists('done', $body)) {
            send_json(400, ['error' => 'done required']);
            exit;
        }
        $raw = $body['done'];
        $done = $raw === true || $raw === 1 || $raw === '1' || $raw === 'true';
        try {
            update_user_craft_order_ingredient_done($db, $userId, $orderId, $itemId, $done);
        } catch (InvalidArgumentException $e) {
            send_json(400, ['error' => $e->getMessage()]);
            exit;
        } catch (Throwable $e) {
            if (api_is_missing_db_table($e)) {
                send_json(503, ['error' => 'Не найдена таблица в БД. Выполните миграцию: 022_user_craft_order_ingredient_done.sql.']);
                exit;
            }
            send_json(500, ['error' => $e->getMessage()]);
            exit;
        }
        send_json(200, ['ok' => true]);
        exit;
    }

    send_json(405, ['error' => 'Method not allowed']);
    exit;
}

if ($path === '/admin/default-buy-prices' || $path === '/default-buy-prices-admin') {
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

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        require_method('GET');
        $prices = get_default_buy_prices($db);
        send_json(200, ['prices' => $prices]);
        exit;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        require_method('POST');
        $body = read_json_body();
        $itemId = trim((string)($body['itemId'] ?? ''));
        $value = trim((string)($body['value'] ?? ''));
        if ($itemId === '') {
            send_json(400, ['error' => 'itemId required']);
            exit;
        }
        if ($value === '') {
            delete_default_buy_price($db, $itemId);
        } else {
            upsert_default_buy_price($db, $itemId, $value);
        }
        send_json(200, ['ok' => true]);
        exit;
    }

    send_json(405, ['error' => 'Method not allowed']);
    exit;
}

if ($path === '/users-admin/list' || $path === '/admin/users') {
    require_method('GET');
    $token = bearer_token_from_headers();
    if (!$token) {
        send_json(401, ['error' => 'Missing token']);
        exit;
    }
    $currentUser = find_user_by_token($db, $token);
    if (!$currentUser) {
        send_json(401, ['error' => 'Invalid token']);
        exit;
    }
    if (!role_at_least($currentUser, 'admin')) {
        send_json(403, ['error' => 'Недостаточно прав']);
        exit;
    }
    $users = list_users($db);
    $items = array_map(static function (array $row): array {
        return [
            'id' => (int)$row['id'],
            'nickname' => (string)$row['nickname'],
            'role' => normalize_user_role((string)$row['role']),
            'avatarUrl' => $row['avatar_url'] ?: null,
            'createdAt' => (string)$row['created_at'],
        ];
    }, $users);
    send_json(200, ['items' => $items]);
    exit;
}

if ($path === '/users-admin/update' || $path === '/admin/users/update') {
    require_method('POST');
    $token = bearer_token_from_headers();
    if (!$token) {
        send_json(401, ['error' => 'Missing token']);
        exit;
    }
    $currentUser = find_user_by_token($db, $token);
    if (!$currentUser) {
        send_json(401, ['error' => 'Invalid token']);
        exit;
    }
    if (!role_at_least($currentUser, 'admin')) {
        send_json(403, ['error' => 'Недостаточно прав']);
        exit;
    }
    $body = read_json_body();
    $userId = (int)($body['id'] ?? 0);
    $nickname = (string)($body['nickname'] ?? '');
    $role = (string)($body['role'] ?? '');
    if ($userId <= 0) {
        send_json(400, ['error' => 'id required']);
        exit;
    }
    if ((int)$currentUser['id'] === $userId && normalize_user_role($role) !== 'admin') {
        send_json(400, ['error' => 'Admin cannot remove own admin role']);
        exit;
    }
    try {
        update_user_profile($db, $userId, $nickname, $role);
    } catch (Throwable $e) {
        send_json(400, ['error' => $e->getMessage()]);
        exit;
    }
    send_json(200, ['ok' => true]);
    exit;
}

if ($path === '/users-admin/delete' || $path === '/admin/users/delete') {
    require_method('POST');
    $token = bearer_token_from_headers();
    if (!$token) {
        send_json(401, ['error' => 'Missing token']);
        exit;
    }
    $currentUser = find_user_by_token($db, $token);
    if (!$currentUser) {
        send_json(401, ['error' => 'Invalid token']);
        exit;
    }
    if (!role_at_least($currentUser, 'admin')) {
        send_json(403, ['error' => 'Недостаточно прав']);
        exit;
    }
    $body = read_json_body();
    $userId = (int)($body['id'] ?? 0);
    if ($userId <= 0) {
        send_json(400, ['error' => 'id required']);
        exit;
    }
    if ((int)$currentUser['id'] === $userId) {
        send_json(400, ['error' => 'Admin cannot delete own account']);
        exit;
    }
    delete_user_by_id($db, $userId);
    send_json(200, ['ok' => true]);
    exit;
}

send_json(404, ['error' => 'Not found']);

