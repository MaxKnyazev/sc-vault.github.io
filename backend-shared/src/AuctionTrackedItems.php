<?php

declare(strict_types=1);

/** Глобальный список (крон, вкладка «Все отслеживания»). */
function get_global_tracked_auction_item_ids(PDO $db): array
{
    $stmt = $db->query('SELECT item_id FROM auction_tracked_items ORDER BY created_at ASC');
    $rows = $stmt->fetchAll();
    $ids = [];
    foreach ($rows as $row) {
        $ids[] = (string)$row['item_id'];
    }
    return $ids;
}

/** Совместимость: крон и сборщик используют только глобальный список. */
function get_tracked_auction_item_ids(PDO $db): array
{
    return get_global_tracked_auction_item_ids($db);
}

function get_user_tracked_auction_item_ids(PDO $db, int $userId): array
{
    $stmt = $db->prepare(
        'SELECT item_id FROM auction_user_tracked_items WHERE user_id = ? ORDER BY created_at ASC',
    );
    $stmt->execute([$userId]);
    $ids = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $ids[] = (string)($row['item_id'] ?? '');
    }
    return array_values(array_filter($ids, static fn ($id) => $id !== ''));
}

function global_has_tracked_item(PDO $db, string $itemId): bool
{
    $norm = trim($itemId);
    if ($norm === '') {
        return false;
    }
    $stmt = $db->prepare('SELECT 1 FROM auction_tracked_items WHERE item_id = ? LIMIT 1');
    $stmt->execute([$norm]);
    return (bool)$stmt->fetchColumn();
}

/**
 * @param list<string> $itemIds
 * @return array<string, true> item_id => true для глобально отслеживаемых
 */
function global_tracked_item_id_lookup(PDO $db, array $itemIds): array
{
    $normalized = [];
    foreach ($itemIds as $itemId) {
        $id = trim((string)$itemId);
        if ($id !== '') {
            $normalized[$id] = true;
        }
    }
    $ids = array_keys($normalized);
    if (count($ids) === 0) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $db->prepare(
        "SELECT item_id FROM auction_tracked_items WHERE item_id IN ($placeholders)",
    );
    $stmt->execute($ids);
    $out = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $id = trim((string)($row['item_id'] ?? ''));
        if ($id !== '') {
            $out[$id] = true;
        }
    }
    return $out;
}

function user_has_tracked_item(PDO $db, int $userId, string $itemId): bool
{
    $norm = trim($itemId);
    if ($norm === '') {
        return false;
    }
    $stmt = $db->prepare(
        'SELECT 1 FROM auction_user_tracked_items WHERE user_id = ? AND item_id = ? LIMIT 1',
    );
    $stmt->execute([$userId, $norm]);
    return (bool)$stmt->fetchColumn();
}

function insert_global_tracked_item(PDO $db, string $itemId, ?int $addedByUserId): void
{
    $normalized = trim($itemId);
    if ($normalized === '') {
        throw new InvalidArgumentException('itemId required');
    }
    $stmt = $db->prepare(
        'INSERT INTO auction_tracked_items (item_id, added_by_user_id, created_at)
         VALUES (?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE item_id = item_id',
    );
    $stmt->execute([$normalized, $addedByUserId]);
}

function add_user_tracked_row(PDO $db, int $userId, string $itemId): void
{
    $norm = trim($itemId);
    if ($norm === '') {
        throw new InvalidArgumentException('itemId required');
    }
    $stmt = $db->prepare(
        'INSERT INTO auction_user_tracked_items (user_id, item_id, created_at)
         VALUES (?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE item_id = VALUES(item_id)',
    );
    $stmt->execute([$userId, $norm]);
}

/**
 * @return array{addedGlobal: bool}
 */
function ensure_tracked_for_user(PDO $db, string $itemId, int $userId, ?int $addedByUserId): array
{
    $norm = trim($itemId);
    if ($norm === '') {
        throw new InvalidArgumentException('itemId required');
    }
    if (global_has_tracked_item($db, $norm)) {
        add_user_tracked_row($db, $userId, $norm);
        return ['addedGlobal' => false];
    }
    insert_global_tracked_item($db, $norm, $addedByUserId ?? $userId);
    add_user_tracked_row($db, $userId, $norm);
    return ['addedGlobal' => true];
}

function remove_user_tracked_row(PDO $db, int $userId, string $itemId): void
{
    $norm = trim($itemId);
    if ($norm === '') {
        throw new InvalidArgumentException('itemId required');
    }
    require_once __DIR__ . '/AuctionTrackedSubscriptions.php';
    delete_all_subscriptions_for_user_item($db, $userId, $norm);
    $stmt = $db->prepare('DELETE FROM auction_user_tracked_items WHERE user_id = ? AND item_id = ?');
    $stmt->execute([$userId, $norm]);
}

function remove_global_tracked_admin(PDO $db, string $itemId): void
{
    $norm = trim($itemId);
    if ($norm === '') {
        throw new InvalidArgumentException('itemId required');
    }
    $stmt = $db->prepare('DELETE FROM auction_tracked_items WHERE item_id = ?');
    $stmt->execute([$norm]);
    $stmt = $db->prepare('DELETE FROM auction_user_tracked_items WHERE item_id = ?');
    $stmt->execute([$norm]);
    $stmt = $db->prepare('DELETE FROM auction_tracked_desired_buy_prices WHERE item_id = ?');
    $stmt->execute([$norm]);
    require_once __DIR__ . '/AuctionTrackedSubscriptions.php';
    delete_all_subscriptions_for_item($db, $norm);
}

/** @deprecated Используйте ensure_tracked_for_user; оставлено для совместимости вызовов. */
function add_tracked_auction_item(PDO $db, string $itemId, ?int $userId): void
{
    if ($userId === null) {
        insert_global_tracked_item($db, $itemId, null);
        return;
    }
    ensure_tracked_for_user($db, $itemId, $userId, $userId);
}

/** @deprecated Используйте remove_user_tracked_row или remove_global_tracked_admin. */
function remove_tracked_auction_item(PDO $db, string $itemId): void
{
    remove_global_tracked_admin($db, $itemId);
}

function normalize_auction_item_name_key(string $name): string
{
    $trimmed = trim($name);
    if ($trimmed === '') {
        return '';
    }
    $singleSpaced = preg_replace('/\s+/u', ' ', $trimmed);
    $singleSpaced = str_replace(['Ё', 'ё'], ['Е', 'е'], (string)$singleSpaced);
    $singleSpaced = preg_replace('/[«»"\'`]+/u', '', (string)$singleSpaced);
    return mb_strtolower((string)$singleSpaced, 'UTF-8');
}

function auction_item_name_cache_path(): string
{
    $dir = sys_get_temp_dir() . '/sctool-auction-item-name-cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    return $dir . '/ru-items-name-index.json';
}

function load_auction_item_name_cache(int $maxAgeSeconds = 86400): ?array
{
    $path = auction_item_name_cache_path();
    if (!is_file($path)) {
        return null;
    }
    $raw = @file_get_contents($path);
    if (!is_string($raw) || trim($raw) === '') {
        return null;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return null;
    }
    $builtAt = (int)($decoded['builtAt'] ?? 0);
    if ($builtAt <= 0 || (time() - $builtAt) > $maxAgeSeconds) {
        return null;
    }
    $items = $decoded['items'] ?? null;
    return is_array($items) ? $items : null;
}

function save_auction_item_name_cache(array $items): void
{
    $path = auction_item_name_cache_path();
    @file_put_contents($path, json_encode([
        'builtAt' => time(),
        'items' => $items,
    ], JSON_UNESCAPED_UNICODE));
}

function build_auction_item_name_index_from_listing(): array
{
    $url = 'https://raw.githubusercontent.com/EXBO-Studio/stalcraft-database/main/ru/listing.json';
    $raw = @file_get_contents($url);
    if (!is_string($raw) || trim($raw) === '') {
        throw new RuntimeException('Failed to load listing.json');
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid listing.json');
    }
    $index = [];
    foreach ($decoded as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $id = '';
        $data = (string)($entry['data'] ?? '');
        if (preg_match('#/items/.+/([A-Za-z0-9]+)\.json$#', $data, $m)) {
            $id = (string)$m[1];
        }
        if ($id === '') {
            continue;
        }
        $ruName = (string)($entry['name']['lines']['ru'] ?? '');
        $key = normalize_auction_item_name_key($ruName);
        if ($key === '' || isset($index[$key])) {
            continue;
        }
        $index[$key] = $id;
    }
    return $index;
}

function build_auction_item_name_index_from_archive(): array
{
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('ZipArchive extension is required for name-based lookup');
    }
    $zipUrl = 'https://codeload.github.com/EXBO-Studio/stalcraft-database/zip/refs/heads/main';
    $archiveBody = @file_get_contents($zipUrl);
    if (!is_string($archiveBody) || $archiveBody === '') {
        throw new RuntimeException('Failed to download item archive');
    }
    $tmp = tempnam(sys_get_temp_dir(), 'scdb-zip-');
    if ($tmp === false) {
        throw new RuntimeException('Failed to create temp file for item archive');
    }
    @file_put_contents($tmp, $archiveBody);

    $zip = new ZipArchive();
    $opened = $zip->open($tmp);
    if ($opened !== true) {
        @unlink($tmp);
        throw new RuntimeException('Failed to open item archive');
    }

    $index = [];
    for ($i = 0; $i < $zip->numFiles; $i += 1) {
        $name = (string)$zip->getNameIndex($i);
        if ($name === '' || !str_starts_with($name, 'stalcraft-database-main/ru/items/') || !str_ends_with($name, '.json')) {
            continue;
        }
        $rawItem = $zip->getFromIndex($i);
        if (!is_string($rawItem) || trim($rawItem) === '') {
            continue;
        }
        $decoded = json_decode($rawItem, true);
        if (!is_array($decoded)) {
            continue;
        }
        $id = trim((string)($decoded['id'] ?? ''));
        $ruName = (string)($decoded['name']['lines']['ru'] ?? '');
        $key = normalize_auction_item_name_key($ruName);
        if ($id === '' || $key === '' || isset($index[$key])) {
            continue;
        }
        $index[$key] = $id;
    }

    $zip->close();
    @unlink($tmp);
    return $index;
}

function resolve_auction_item_id_by_exact_name(string $name): string
{
    $key = normalize_auction_item_name_key($name);
    if ($key === '') {
        throw new InvalidArgumentException('name required');
    }

    $cached = load_auction_item_name_cache();
    if (is_array($cached) && isset($cached[$key])) {
        return (string)$cached[$key];
    }

    try {
        $listingIndex = build_auction_item_name_index_from_listing();
        if (isset($listingIndex[$key])) {
            return (string)$listingIndex[$key];
        }
    } catch (Throwable $e) {
        // Fallback to archive index.
    }

    $archiveIndex = build_auction_item_name_index_from_archive();
    save_auction_item_name_cache($archiveIndex);
    if (!isset($archiveIndex[$key])) {
        $candidates = [];
        foreach ($archiveIndex as $candidateName => $candidateId) {
            if (str_contains($candidateName, $key) || str_contains($key, $candidateName)) {
                $candidates[] = $candidateName;
            }
            if (count($candidates) >= 8) {
                break;
            }
        }
        if (count($candidates) > 0) {
            throw new RuntimeException('Item with exact name not found. Similar: ' . implode(', ', $candidates));
        }
        throw new RuntimeException('Item with exact name not found in official item database');
    }
    return (string)$archiveIndex[$key];
}
