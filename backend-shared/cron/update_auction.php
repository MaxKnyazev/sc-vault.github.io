<?php

declare(strict_types=1);

$config = require __DIR__ . '/../config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Auction.php';

const HISTORY_LIMIT = 100;
const DEFAULT_MAX_PAGES_PER_ITEM = 20;
const DEFAULT_SLEEP_BETWEEN_PAGES_MS = 0;
const DEFAULT_SLEEP_BETWEEN_ITEMS_MS = 0;
const DEFAULT_PROGRESS_EVERY = 25;

function read_int_env(string $key, int $fallback): int
{
    $raw = getenv($key);
    if ($raw === false || $raw === '') return $fallback;
    $v = (int)$raw;
    return $v >= 0 ? $v : $fallback;
}

function read_item_ids(array $config): array
{
    $csv = trim((string)getenv('AUCTION_ITEM_IDS'));
    if ($csv !== '') {
        return array_values(array_filter(array_unique(array_map('trim', explode(',', $csv)))));
    }

    $file = __DIR__ . '/item_ids.txt';
    if (!file_exists($file)) {
        return [];
    }

    $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) {
        return [];
    }
    return array_values(array_filter(array_unique(array_map('trim', $lines))));
}

function fetch_history_page(array $config, string $itemId, int $offset): array
{
    $base = rtrim((string)$config['auction_api_base_url'], '/');
    $region = strtolower((string)$config['auction_region']);
    $url = sprintf(
        '%s/%s/auction/%s/history?offset=%d&limit=%d&additional=false',
        $base,
        $region,
        rawurlencode($itemId),
        $offset,
        HISTORY_LIMIT
    );

    $headers = [
        'Accept: application/json',
        'Client-Id: ' . $config['exbo_client_id'],
        'Client-Secret: ' . $config['exbo_client_secret'],
    ];

    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => implode("\r\n", $headers),
            'timeout' => 20,
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) {
        throw new RuntimeException('HTTP request failed for ' . $itemId . ' offset=' . $offset);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new RuntimeException('Invalid JSON for ' . $itemId . ' offset=' . $offset);
    }
    return $data;
}

function aggregate_item(array $config, string $itemId, int $maxPagesPerItem, int $sleepBetweenPagesMs): array
{
    $cutoff = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
        ->sub(new DateInterval('PT' . ((int)$config['auction_window_hours']) . 'H'))
        ->getTimestamp();

    $offset = 0;
    $pageCount = 0;
    $totalQty = 0;
    $totalRevenue = 0.0;
    $tradeCount = 0;

    while (true) {
        $pageCount++;
        $data = fetch_history_page($config, $itemId, $offset);
        $prices = is_array($data['prices'] ?? null) ? $data['prices'] : [];
        if (count($prices) === 0) {
            break;
        }

        $oldest = PHP_INT_MAX;
        foreach ($prices as $row) {
            $t = strtotime((string)($row['time'] ?? ''));
            if ($t === false) {
                continue;
            }
            $oldest = min($oldest, $t);
            if ($t >= $cutoff) {
                $totalQty += (int)($row['amount'] ?? 0);
                $totalRevenue += (float)($row['price'] ?? 0);
                $tradeCount += 1;
            }
        }

        if (count($prices) < HISTORY_LIMIT || $oldest < $cutoff || $pageCount >= $maxPagesPerItem) {
            break;
        }
        $offset += HISTORY_LIMIT;
        if ($sleepBetweenPagesMs > 0) {
            usleep($sleepBetweenPagesMs * 1000);
        }
    }

    return [
        'avgPerUnit' => $totalQty > 0 ? $totalRevenue / $totalQty : null,
        'totalQty' => $totalQty,
        'totalRevenue' => $totalRevenue,
        'tradeCount' => $tradeCount,
        'fetchedAt' => gmdate('Y-m-d H:i:s'),
    ];
}

if ($config['exbo_client_id'] === '' || $config['exbo_client_secret'] === '') {
    fwrite(STDERR, "Missing EXBO_CLIENT_ID / EXBO_CLIENT_SECRET\n");
    exit(1);
}

$itemIds = read_item_ids($config);
if (count($itemIds) === 0) {
    fwrite(STDERR, "No item ids provided (AUCTION_ITEM_IDS or cron/item_ids.txt)\n");
    exit(1);
}

$db = db_connect($config);
$processed = 0;
$failed = 0;
$maxPagesPerItem = read_int_env('AUCTION_MAX_PAGES_PER_ITEM', DEFAULT_MAX_PAGES_PER_ITEM);
$sleepBetweenPagesMs = read_int_env('AUCTION_SLEEP_BETWEEN_PAGES_MS', DEFAULT_SLEEP_BETWEEN_PAGES_MS);
$sleepBetweenItemsMs = read_int_env('AUCTION_SLEEP_BETWEEN_ITEMS_MS', DEFAULT_SLEEP_BETWEEN_ITEMS_MS);
$progressEvery = max(1, read_int_env('AUCTION_PROGRESS_EVERY', DEFAULT_PROGRESS_EVERY));
$itemLimit = read_int_env('AUCTION_ITEM_LIMIT', 0);
$targetItemIds = $itemLimit > 0 ? array_slice($itemIds, 0, $itemLimit) : $itemIds;

foreach ($targetItemIds as $idx => $itemId) {
    try {
        $agg = aggregate_item($config, $itemId, $maxPagesPerItem, $sleepBetweenPagesMs);
        upsert_auction_stat($db, $itemId, $agg, '12h');
        $processed++;
        if ($sleepBetweenItemsMs > 0) {
            usleep($sleepBetweenItemsMs * 1000);
        }
    } catch (Throwable $e) {
        $failed++;
        fwrite(STDERR, sprintf("[%s] %s\n", $itemId, $e->getMessage()));
    }
    $current = $idx + 1;
    if ($current % $progressEvery === 0 || $current === count($targetItemIds)) {
        fwrite(STDOUT, sprintf("progress: %d/%d, ok=%d failed=%d\n", $current, count($targetItemIds), $processed, $failed));
    }
}

fwrite(STDOUT, sprintf("auction cron done: total=%d ok=%d failed=%d\n", count($targetItemIds), $processed, $failed));

