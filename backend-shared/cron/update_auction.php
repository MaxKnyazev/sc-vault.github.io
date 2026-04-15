<?php

declare(strict_types=1);

$config = require __DIR__ . '/../config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Auction.php';
require __DIR__ . '/../src/AuctionTrackedItems.php';
require __DIR__ . '/../src/AuctionBlacklist.php';

const HISTORY_LIMIT = 100;
const DEFAULT_MAX_PAGES_PER_ITEM = 20;
const DEFAULT_SLEEP_BETWEEN_PAGES_MS = 0;
const DEFAULT_SLEEP_BETWEEN_ITEMS_MS = 0;
const DEFAULT_PROGRESS_EVERY = 25;
const DEFAULT_COLLECT_LOOKBACK_MINUTES = 65;
const DEFAULT_STATS_WINDOWS = '12h';
const DEFAULT_RAW_RETENTION_HOURS = 24;
const DEFAULT_HOURLY_RETENTION_DAYS = 8;

function read_int_env(string $key, int $fallback): int
{
    $raw = getenv($key);
    if ($raw === false || $raw === '') return $fallback;
    $v = (int)$raw;
    return $v >= 0 ? $v : $fallback;
}

function read_item_ids(array $config): array
{
    global $db;
    $csv = trim((string)getenv('AUCTION_ITEM_IDS'));
    $collected = [];
    if ($csv !== '') {
        $collected = array_values(array_filter(array_unique(array_map('trim', explode(',', $csv)))));
    }

    $file = __DIR__ . '/item_ids.txt';
    if (file_exists($file)) {
        $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (is_array($lines)) {
            $collected = [...$collected, ...array_values(array_filter(array_unique(array_map('trim', $lines))))];
        }
    }

    if (isset($db) && $db instanceof PDO) {
        try {
            $tracked = get_tracked_auction_item_ids($db);
            $collected = [...$collected, ...$tracked];
        } catch (Throwable $e) {
            fwrite(STDERR, "tracked-items read failed: " . $e->getMessage() . "\n");
        }
    }

    return array_values(array_filter(array_unique(array_map('trim', $collected))));
}

function fetch_history_page(array $config, string $itemId, int $offset): array
{
    $base = rtrim((string)$config['auction_api_base_url'], '/');
    $region = strtolower((string)$config['auction_region']);
    $url = sprintf(
        '%s/%s/auction/%s/history?offset=%d&limit=%d&additional=true',
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

function parse_window_names(string $rawWindows): array
{
    $parts = array_values(array_filter(array_map('trim', explode(',', $rawWindows))));
    $windows = [];
    foreach ($parts as $part) {
        $windows[] = normalize_window_name($part);
    }
    if (count($windows) === 0) {
        $windows[] = normalize_window_name(DEFAULT_STATS_WINDOWS);
    }
    return array_values(array_unique($windows));
}

function rollup_marker_path(): string
{
    $dir = sys_get_temp_dir() . '/sctool-auction-rollup';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    return $dir . '/last_rollup_utc_date.txt';
}

function is_daily_rollup_due(): bool
{
    $today = gmdate('Y-m-d');
    $marker = rollup_marker_path();
    if (!is_file($marker)) {
        return true;
    }
    $last = trim((string)@file_get_contents($marker));
    return $last !== $today;
}

function mark_daily_rollup_done(): void
{
    @file_put_contents(rollup_marker_path(), gmdate('Y-m-d'));
}

function collect_raw_trades_for_item(
    PDO $db,
    array $config,
    string $itemId,
    int $maxPagesPerItem,
    int $sleepBetweenPagesMs,
    int $lookbackMinutes
): array {
    $cutoff = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
        ->sub(new DateInterval('PT' . $lookbackMinutes . 'M'))
        ->getTimestamp();

    $collectedAt = gmdate('Y-m-d H:i:s');
    $offset = 0;
    $pageCount = 0;
    $insertedCount = 0;
    $seenCount = 0;

    while (true) {
        $pageCount++;
        $data = fetch_history_page($config, $itemId, $offset);
        $prices = is_array($data['prices'] ?? null) ? $data['prices'] : [];
        if (count($prices) === 0) {
            break;
        }

        $oldest = PHP_INT_MAX;
        foreach ($prices as $rowIndex => $row) {
            $t = strtotime((string)($row['time'] ?? ''));
            if ($t === false) {
                continue;
            }
            $oldest = min($oldest, $t);
            if ($t >= $cutoff) {
                $amount = (int)($row['amount'] ?? 0);
                $price = (float)($row['price'] ?? 0);
                $soldAt = gmdate('Y-m-d H:i:s', $t);
                $qualityKey = normalize_quality_key_from_trade_row($row);
                $dedupKey = hash(
                    'sha256',
                    implode('|', [
                        $itemId,
                        $qualityKey,
                        $soldAt,
                        (string)$amount,
                        sprintf('%.2f', $price),
                    ])
                );

                $inserted = upsert_auction_raw_trade($db, [
                    'itemId' => $itemId,
                    'qualityKey' => $qualityKey,
                    'soldAt' => $soldAt,
                    'amount' => $amount,
                    'price' => $price,
                    'sourceOffset' => $offset,
                    'sourceRowIndex' => $rowIndex,
                    'collectedAt' => $collectedAt,
                    'dedupKey' => $dedupKey,
                ]);
                $seenCount += 1;
                if ($inserted) {
                    $insertedCount += 1;
                }
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
        'seenCount' => $seenCount,
        'insertedCount' => $insertedCount,
        'fetchedAt' => $collectedAt,
    ];
}

function resolve_collect_lookback_minutes_for_item(
    PDO $db,
    string $itemId,
    int $defaultLookbackMinutes,
    int $rawRetentionHours
): int {
    $defaultMinutes = max(1, $defaultLookbackMinutes);
    $maxMinutes = max($defaultMinutes, $rawRetentionHours * 60 + 5);
    $stmt = $db->prepare('SELECT UNIX_TIMESTAMP(MAX(sold_at)) AS last_ts FROM auction_raw_trades WHERE item_id = ?');
    $stmt->execute([$itemId]);
    $row = $stmt->fetch();
    $lastTs = isset($row['last_ts']) ? (int)$row['last_ts'] : 0;
    if ($lastTs <= 0) {
        return $defaultMinutes;
    }
    $gapMinutes = (int)ceil(max(0, time() - $lastTs) / 60);
    // Add small overlap to avoid tiny API/clock drifts around bucket borders.
    $needed = $gapMinutes + 5;
    return min($maxMinutes, max($defaultMinutes, $needed));
}

if ($config['exbo_client_id'] === '' || $config['exbo_client_secret'] === '') {
    fwrite(STDERR, "Missing EXBO_CLIENT_ID / EXBO_CLIENT_SECRET\n");
    exit(1);
}

$db = db_connect($config);
$itemIds = read_item_ids($config);
if (count($itemIds) === 0) {
    fwrite(STDERR, "No item ids provided (AUCTION_ITEM_IDS or cron/item_ids.txt or auction_tracked_items)\n");
    exit(1);
}
$processed = 0;
$failed = 0;
$maxPagesPerItem = read_int_env('AUCTION_MAX_PAGES_PER_ITEM', DEFAULT_MAX_PAGES_PER_ITEM);
$sleepBetweenPagesMs = read_int_env('AUCTION_SLEEP_BETWEEN_PAGES_MS', DEFAULT_SLEEP_BETWEEN_PAGES_MS);
$sleepBetweenItemsMs = read_int_env('AUCTION_SLEEP_BETWEEN_ITEMS_MS', DEFAULT_SLEEP_BETWEEN_ITEMS_MS);
$progressEvery = max(1, read_int_env('AUCTION_PROGRESS_EVERY', DEFAULT_PROGRESS_EVERY));
$itemLimit = read_int_env('AUCTION_ITEM_LIMIT', 0);
$lookbackMinutes = max(1, read_int_env('AUCTION_COLLECT_LOOKBACK_MINUTES', DEFAULT_COLLECT_LOOKBACK_MINUTES));
$statsWindows = parse_window_names((string)getenv('AUCTION_STATS_WINDOWS') ?: DEFAULT_STATS_WINDOWS);
$rawRetentionHours = max(1, read_int_env('AUCTION_RAW_RETENTION_HOURS', DEFAULT_RAW_RETENTION_HOURS));
$hourlyRetentionDays = max(1, read_int_env('AUCTION_HOURLY_RETENTION_DAYS', DEFAULT_HOURLY_RETENTION_DAYS));
$targetItemIds = $itemLimit > 0 ? array_slice($itemIds, 0, $itemLimit) : $itemIds;
$targetItemIds = filter_item_ids_not_blacklisted($db, $targetItemIds);
$insertedTotal = 0;
$seenTotal = 0;
$hourlyUpsertRowsTotal = 0;

foreach ($targetItemIds as $idx => $itemId) {
    try {
        $itemLookbackMinutes = resolve_collect_lookback_minutes_for_item(
            $db,
            $itemId,
            $lookbackMinutes,
            $rawRetentionHours
        );
        $collect = collect_raw_trades_for_item(
            $db,
            $config,
            $itemId,
            $maxPagesPerItem,
            $sleepBetweenPagesMs,
            $itemLookbackMinutes
        );
        foreach ($statsWindows as $windowName) {
            recalculate_auction_stat_from_raw($db, $itemId, $windowName, $collect['fetchedAt']);
        }
        $hourlyUpsertRowsTotal += rebuild_hourly_stats_from_raw_for_item($db, $itemId, $rawRetentionHours);
        $insertedTotal += (int)$collect['insertedCount'];
        $seenTotal += (int)$collect['seenCount'];
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
        fwrite(STDOUT, sprintf(
            "progress: %d/%d, ok=%d failed=%d seen=%d inserted=%d\n",
            $current,
            count($targetItemIds),
            $processed,
            $failed,
            $seenTotal,
            $insertedTotal
        ));
    }
}

$deletedRawRows = purge_raw_trades_older_than_hours($db, $rawRetentionHours);
$rollup = ['upsertedDailyRows' => 0, 'deletedHourlyRows' => 0];
if (is_daily_rollup_due()) {
    $rollup = rollup_hourly_to_daily_and_purge($db, $hourlyRetentionDays);
    mark_daily_rollup_done();
}

fwrite(STDOUT, sprintf(
    "auction cron done: total=%d ok=%d failed=%d seen=%d inserted=%d hourly_upserts=%d raw_purged=%d hourly_purged=%d daily_upserted=%d windows=%s\n",
    count($targetItemIds),
    $processed,
    $failed,
    $seenTotal,
    $insertedTotal,
    $hourlyUpsertRowsTotal,
    $deletedRawRows,
    (int)$rollup['deletedHourlyRows'],
    (int)$rollup['upsertedDailyRows'],
    implode(',', $statsWindows)
));

