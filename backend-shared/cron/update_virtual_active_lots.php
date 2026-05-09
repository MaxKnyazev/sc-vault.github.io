<?php

declare(strict_types=1);

$config = require __DIR__ . '/../config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Auction.php';

function get_item_id_from_data_path(string $dataPath): string
{
    $data = str_replace('\\', '/', $dataPath);
    if (preg_match('#/items/.+/([A-Za-z0-9]+)\.json$#', $data, $m)) {
        return (string)$m[1];
    }
    return '';
}

function load_listing_cached(int $maxAgeSeconds = 86400): array
{
    $path = sys_get_temp_dir() . '/sctool-listing-cache-ru.json';
    if (is_file($path)) {
        $mtime = (int)filemtime($path);
        if ($mtime > 0 && (time() - $mtime) <= $maxAgeSeconds) {
            $raw = @file_get_contents($path);
            $decoded = is_string($raw) ? json_decode($raw, true) : null;
            if (is_array($decoded)) {
                return $decoded;
            }
        }
    }
    $url = 'https://raw.githubusercontent.com/EXBO-Studio/stalcraft-database/main/ru/listing.json';
    $raw = @file_get_contents($url);
    if (!is_string($raw) || trim($raw) === '') {
        throw new RuntimeException('Failed to load listing.json');
    }
    @file_put_contents($path, $raw);
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid listing.json');
    }
    return $decoded;
}

function classify_ids(array $listing): array
{
    $core = [];
    $artifact = [];
    foreach ($listing as $entry) {
        if (!is_array($entry)) continue;
        $data = (string)($entry['data'] ?? '');
        if ($data === '') continue;
        $id = get_item_id_from_data_path($data);
        if ($id === '') continue;
        $dataLower = strtolower($data);
        $nameRu = (string)($entry['name']['lines']['ru'] ?? '');
        $nameLower = mb_strtolower($nameRu, 'UTF-8');
        $isArtifact = str_contains($dataLower, '/artefact/') || str_contains($dataLower, '/artifact/');
        $isCore = str_contains($dataLower, '/module/core/') || str_contains($dataLower, '/modules/core/') || str_contains($nameLower, 'ядро модуля');
        if ($isCore) $core[$id] = true;
        if ($isArtifact) $artifact[$id] = true;
    }
    return ['core' => array_keys($core), 'artifact' => array_keys($artifact)];
}

$db = db_connect($config);

$listing = load_listing_cached();
$ids = classify_ids($listing);

$mins = []; // key => ['minPrice'=>int,'itemId'=>string]

$updateMin = function (string $kind, string $quality, int $upgrade, int $price, string $itemId) use (&$mins) {
    $key = $kind . '|' . $quality . '|' . (string)$upgrade;
    if (!isset($mins[$key]) || $price < $mins[$key]['minPrice']) {
        $mins[$key] = ['minPrice' => $price, 'itemId' => $itemId];
    }
};

foreach ($ids['core'] as $itemId) {
    try {
        $lots = get_auction_item_active_lots($db, $config, $itemId, 120);
    } catch (Throwable $e) {
        continue;
    }
    foreach ($lots as $lot) {
        if (!is_array($lot)) continue;
        $quality = (string)($lot['quality'] ?? 'unknown');
        $price = (int)($lot['price'] ?? 0);
        if ($price <= 0) continue;
        $updateMin('core', $quality, -1, $price, $itemId);
    }
}

foreach ($ids['artifact'] as $itemId) {
    try {
        $lots = get_auction_item_active_lots($db, $config, $itemId, 120);
    } catch (Throwable $e) {
        continue;
    }
    foreach ($lots as $lot) {
        if (!is_array($lot)) continue;
        $quality = (string)($lot['quality'] ?? 'unknown');
        $upgrade = (int)($lot['upgrade'] ?? -1);
        $price = (int)($lot['price'] ?? 0);
        if ($price <= 0) continue;
        if ($upgrade < 0 || $upgrade > 15) continue;
        $updateMin('artifact', $quality, $upgrade, $price, $itemId);
    }
}

// Persist
$stmt = $db->prepare(
    'INSERT INTO auction_virtual_active_lot_mins (kind, quality, upgrade, min_price, item_id, updated_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE min_price = VALUES(min_price), item_id = VALUES(item_id), updated_at = UTC_TIMESTAMP()',
);
foreach ($mins as $key => $row) {
    [$kind, $quality, $upgradeStr] = explode('|', $key);
    $stmt->execute([$kind, $quality, (int)$upgradeStr, (int)$row['minPrice'], (string)$row['itemId']]);
}

fwrite(STDOUT, "updated groups: " . count($mins) . "\n");

