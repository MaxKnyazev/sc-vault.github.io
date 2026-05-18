<?php

require_once __DIR__ . '/AuctionHybridSettings.php';

/** Окна, которые использует гибридная оценка (режим time_window) и cron по умолчанию. */
function auction_hybrid_time_windows(): array
{
    return ['1h', '6h', '12h', '24h'];
}

/**
 * Дозаполняет auction_stats из auction_raw_trades для предметов без строки в окне.
 */
function ensure_auction_stats_for_items(PDO $db, array $itemIds, string $window): void
{
    if (count($itemIds) === 0) {
        return;
    }
    $windowName = normalize_window_name($window);
    $existing = get_auction_stats($db, $itemIds, $windowName);
    foreach ($itemIds as $itemId) {
        $id = (string)$itemId;
        if (!isset($existing[$id])) {
            recalculate_auction_stat_from_raw($db, $id, $windowName);
        }
    }
}

function get_auction_stats(PDO $db, array $itemIds, string $window = '12h'): array
{
    if (count($itemIds) === 0) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($itemIds), '?'));
    $sql = "SELECT item_id, avg_per_unit, total_qty, trade_count, total_revenue, fetched_at
            FROM auction_stats
            WHERE item_id IN ($placeholders) AND window_name = ?";
    $stmt = $db->prepare($sql);
    $params = [...$itemIds, $window];
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $byId = [];
    foreach ($rows as $row) {
        $byId[$row['item_id']] = [
            'avgPerUnit' => $row['avg_per_unit'] !== null ? (float)$row['avg_per_unit'] : null,
            'totalQty' => (int)$row['total_qty'],
            'totalRevenue' => (float)$row['total_revenue'],
            'tradeCount' => (int)$row['trade_count'],
            'fetchedAt' => $row['fetched_at'],
        ];
    }
    return $byId;
}

function normalize_window_name(string $window): string
{
    $normalized = strtolower(trim($window));
    if (!preg_match('/^\d+h$/', $normalized)) {
        throw new InvalidArgumentException('Invalid window format, expected like 12h');
    }
    return $normalized;
}

function upsert_auction_raw_trade(PDO $db, array $trade): bool
{
    $stmt = $db->prepare(
        'INSERT INTO auction_raw_trades
          (item_id, quality_key, upgrade_level, sold_at, amount, price, source_offset, source_row_index, collected_at, dedup_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE dedup_key = dedup_key'
    );
    $stmt->execute([
        $trade['itemId'],
        $trade['qualityKey'],
        $trade['upgradeLevel'],
        $trade['soldAt'],
        $trade['amount'],
        $trade['price'],
        $trade['sourceOffset'],
        $trade['sourceRowIndex'],
        $trade['collectedAt'],
        $trade['dedupKey'],
    ]);

    return $stmt->rowCount() === 1;
}

function rebuild_hourly_stats_from_raw_for_item(PDO $db, string $itemId, int $rawRetentionHours): int
{
    $hours = max(1, $rawRetentionHours);
    $windowExpr = sprintf('UTC_TIMESTAMP() - INTERVAL %d HOUR', $hours);
    $stmt = $db->prepare(
        "INSERT INTO auction_hourly_stats
          (item_id, quality_key, upgrade_level, hour_start, total_qty, total_revenue, trade_count, avg_per_unit, source_min_sold_at, source_max_sold_at, fetched_at, updated_at)
         SELECT
          item_id,
          quality_key,
          upgrade_level,
          DATE_FORMAT(sold_at, '%Y-%m-%d %H:00:00') AS hour_start,
          COALESCE(SUM(amount), 0) AS total_qty,
          COALESCE(SUM(price), 0) AS total_revenue,
          COUNT(*) AS trade_count,
          CASE WHEN COALESCE(SUM(amount), 0) > 0 THEN COALESCE(SUM(price), 0) / SUM(amount) ELSE NULL END AS avg_per_unit,
          MIN(sold_at) AS source_min_sold_at,
          MAX(sold_at) AS source_max_sold_at,
          UTC_TIMESTAMP() AS fetched_at,
          UTC_TIMESTAMP() AS updated_at
         FROM auction_raw_trades
         WHERE item_id = ? AND sold_at >= {$windowExpr}
         GROUP BY item_id, quality_key, upgrade_level, DATE_FORMAT(sold_at, '%Y-%m-%d %H:00:00')
         ON DUPLICATE KEY UPDATE
          total_qty = VALUES(total_qty),
          total_revenue = VALUES(total_revenue),
          trade_count = VALUES(trade_count),
          avg_per_unit = VALUES(avg_per_unit),
          source_min_sold_at = VALUES(source_min_sold_at),
          source_max_sold_at = VALUES(source_max_sold_at),
          fetched_at = VALUES(fetched_at),
          updated_at = UTC_TIMESTAMP()"
    );
    $stmt->execute([$itemId]);
    return $stmt->rowCount();
}

function purge_raw_trades_older_than_hours(PDO $db, int $rawRetentionHours, int $batchSize = 10000): int
{
    $hours = max(1, $rawRetentionHours);
    $cutoffExpr = sprintf('UTC_TIMESTAMP() - INTERVAL %d HOUR', $hours);
    $limit = max(1000, $batchSize);
    $deletedTotal = 0;

    while (true) {
        $stmt = $db->prepare(
            "DELETE FROM auction_raw_trades
             WHERE sold_at < {$cutoffExpr}
             ORDER BY sold_at
             LIMIT {$limit}"
        );
        $stmt->execute();
        $deleted = $stmt->rowCount();
        $deletedTotal += $deleted;
        if ($deleted < $limit) {
            break;
        }
    }

    return $deletedTotal;
}

function rollup_hourly_to_daily_and_purge(PDO $db, int $hourlyRetentionDays, int $batchSize = 10000): array
{
    $days = max(1, $hourlyRetentionDays);
    // Roll up only full UTC days so each daily row is exactly one calendar day.
    $cutoffExpr = sprintf('UTC_DATE() - INTERVAL %d DAY', $days);
    $limit = max(1000, $batchSize);

    $upsertedRows = 0;
    $deletedHourlyRows = 0;

    while (true) {
        $db->beginTransaction();
        try {
            $insertStmt = $db->prepare(
                "INSERT INTO auction_daily_stats
                  (item_id, quality_key, upgrade_level, day_date, total_qty, total_revenue, trade_count, avg_per_unit, source_hours_count, fetched_at, updated_at)
                 SELECT
                  item_id,
                  quality_key,
                  upgrade_level,
                  DATE(hour_start) AS day_date,
                  COALESCE(SUM(total_qty), 0) AS total_qty,
                  COALESCE(SUM(total_revenue), 0) AS total_revenue,
                  COALESCE(SUM(trade_count), 0) AS trade_count,
                  CASE WHEN COALESCE(SUM(total_qty), 0) > 0 THEN COALESCE(SUM(total_revenue), 0) / SUM(total_qty) ELSE NULL END AS avg_per_unit,
                  COUNT(*) AS source_hours_count,
                  UTC_TIMESTAMP() AS fetched_at,
                  UTC_TIMESTAMP() AS updated_at
                 FROM (
                    SELECT item_id, quality_key, upgrade_level, hour_start, total_qty, total_revenue, trade_count
                    FROM auction_hourly_stats
                    WHERE hour_start < {$cutoffExpr}
                    ORDER BY hour_start
                    LIMIT {$limit}
                 ) AS batch
                 GROUP BY item_id, quality_key, upgrade_level, DATE(hour_start)
                 ON DUPLICATE KEY UPDATE
                  total_qty = total_qty + VALUES(total_qty),
                  total_revenue = total_revenue + VALUES(total_revenue),
                  trade_count = trade_count + VALUES(trade_count),
                  avg_per_unit = CASE
                    WHEN (total_qty + VALUES(total_qty)) > 0 THEN (total_revenue + VALUES(total_revenue)) / (total_qty + VALUES(total_qty))
                    ELSE NULL
                  END,
                  source_hours_count = source_hours_count + VALUES(source_hours_count),
                  fetched_at = VALUES(fetched_at),
                  updated_at = UTC_TIMESTAMP()"
            );
            $insertStmt->execute();
            $upsertedRows += $insertStmt->rowCount();

            $deleteStmt = $db->prepare(
                "DELETE FROM auction_hourly_stats
                 WHERE hour_start < {$cutoffExpr}
                 ORDER BY hour_start
                 LIMIT {$limit}"
            );
            $deleteStmt->execute();
            $deleted = $deleteStmt->rowCount();
            $deletedHourlyRows += $deleted;

            $db->commit();
            if ($deleted < $limit) {
                break;
            }
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    return [
        'upsertedDailyRows' => $upsertedRows,
        'deletedHourlyRows' => $deletedHourlyRows,
    ];
}

function recalculate_auction_stat_from_raw(PDO $db, string $itemId, string $window, ?string $fetchedAt = null): void
{
    $windowName = normalize_window_name($window);
    $hours = (int)substr($windowName, 0, -1);
    $fetchedAtValue = $fetchedAt ?: gmdate('Y-m-d H:i:s');
    $cutoffExpr = sprintf('UTC_TIMESTAMP() - INTERVAL %d HOUR', $hours);

    $select = $db->query(
        "SELECT
            COALESCE(SUM(amount), 0) AS total_qty,
            COALESCE(SUM(price), 0) AS total_revenue,
            COUNT(*) AS trade_count
         FROM auction_raw_trades
         WHERE item_id = " . $db->quote($itemId) . " AND sold_at >= {$cutoffExpr}"
    );
    $row = $select->fetch();
    $totalQty = (int)($row['total_qty'] ?? 0);
    $totalRevenue = (float)($row['total_revenue'] ?? 0);
    $tradeCount = (int)($row['trade_count'] ?? 0);

    if ($hours > 24) {
        $hourlyCutoffExpr = sprintf('UTC_TIMESTAMP() - INTERVAL %d HOUR', $hours);
        $hourlySelect = $db->query(
            "SELECT
                COALESCE(SUM(total_qty), 0) AS total_qty,
                COALESCE(SUM(total_revenue), 0) AS total_revenue,
                COALESCE(SUM(trade_count), 0) AS trade_count
             FROM auction_hourly_stats
             WHERE item_id = " . $db->quote($itemId) . "
               AND hour_start >= {$hourlyCutoffExpr}
               AND hour_start < UTC_TIMESTAMP() - INTERVAL 24 HOUR"
        );
        $hourlyRow = $hourlySelect->fetch();
        $totalQty += (int)($hourlyRow['total_qty'] ?? 0);
        $totalRevenue += (float)($hourlyRow['total_revenue'] ?? 0);
        $tradeCount += (int)($hourlyRow['trade_count'] ?? 0);
    }

    $avgPerUnit = $totalQty > 0 ? ($totalRevenue / $totalQty) : null;

    upsert_auction_stat($db, $itemId, [
        'avgPerUnit' => $avgPerUnit,
        'totalQty' => $totalQty,
        'totalRevenue' => $totalRevenue,
        'tradeCount' => $tradeCount,
        'fetchedAt' => $fetchedAtValue,
    ], $windowName);
}

function upsert_auction_stat(PDO $db, string $itemId, array $agg, string $window = '12h'): void
{
    $windowName = normalize_window_name($window);
    $stmt = $db->prepare(
        'INSERT INTO auction_stats (item_id, window_name, avg_per_unit, total_qty, total_revenue, trade_count, fetched_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           avg_per_unit = VALUES(avg_per_unit),
           total_qty = VALUES(total_qty),
           total_revenue = VALUES(total_revenue),
           trade_count = VALUES(trade_count),
           fetched_at = VALUES(fetched_at),
           updated_at = UTC_TIMESTAMP()'
    );
    $stmt->execute([
        $itemId,
        $windowName,
        $agg['avgPerUnit'],
        $agg['totalQty'],
        $agg['totalRevenue'],
        $agg['tradeCount'],
        $agg['fetchedAt'],
    ]);
}

function normalize_history_range(string $range): string
{
    $normalized = strtolower(trim($range));
    $allowed = ['30m', '1h', '12h', '24h', '7d', '30d', '90d'];
    if (!in_array($normalized, $allowed, true)) {
        throw new InvalidArgumentException('Invalid history range');
    }
    return $normalized;
}

function normalize_history_zoom(mixed $zoom): int
{
    $value = (int)$zoom;
    if (!in_array($value, [1, 2, 4], true)) {
        throw new InvalidArgumentException('Invalid history zoom');
    }
    return $value;
}

function get_history_plan(string $range, int $zoom): array
{
    $plans = [
        '30m' => [
            1 => ['rangeSec' => 30 * 60, 'bucketSec' => 180, 'targetPoints' => 10],
            2 => ['rangeSec' => 30 * 60, 'bucketSec' => 90, 'targetPoints' => 20],
            4 => ['rangeSec' => 30 * 60, 'bucketSec' => 45, 'targetPoints' => 40],
        ],
        '1h' => [
            1 => ['rangeSec' => 60 * 60, 'bucketSec' => 300, 'targetPoints' => 12],
            2 => ['rangeSec' => 60 * 60, 'bucketSec' => 150, 'targetPoints' => 24],
            4 => ['rangeSec' => 60 * 60, 'bucketSec' => 75, 'targetPoints' => 48],
        ],
        '12h' => [
            1 => ['rangeSec' => 12 * 60 * 60, 'bucketSec' => 3600, 'targetPoints' => 12],
            2 => ['rangeSec' => 12 * 60 * 60, 'bucketSec' => 1800, 'targetPoints' => 24],
            4 => ['rangeSec' => 12 * 60 * 60, 'bucketSec' => 900, 'targetPoints' => 48],
        ],
        '24h' => [
            1 => ['rangeSec' => 24 * 60 * 60, 'bucketSec' => 7200, 'targetPoints' => 12],
            2 => ['rangeSec' => 24 * 60 * 60, 'bucketSec' => 3600, 'targetPoints' => 24],
            4 => ['rangeSec' => 24 * 60 * 60, 'bucketSec' => 1800, 'targetPoints' => 48],
        ],
        '7d' => [
            1 => ['rangeSec' => 7 * 24 * 60 * 60, 'bucketSec' => 24 * 3600, 'targetPoints' => 7],
            2 => ['rangeSec' => 7 * 24 * 60 * 60, 'bucketSec' => 12 * 3600, 'targetPoints' => 14],
            4 => ['rangeSec' => 7 * 24 * 60 * 60, 'bucketSec' => 6 * 3600, 'targetPoints' => 28],
        ],
        '30d' => [
            1 => ['rangeSec' => 30 * 24 * 60 * 60, 'bucketSec' => 3 * 24 * 3600, 'targetPoints' => 10],
            2 => ['rangeSec' => 30 * 24 * 60 * 60, 'bucketSec' => 2 * 24 * 3600, 'targetPoints' => 15],
            4 => ['rangeSec' => 30 * 24 * 60 * 60, 'bucketSec' => 24 * 3600, 'targetPoints' => 30],
        ],
        '90d' => [
            1 => ['rangeSec' => 90 * 24 * 60 * 60, 'bucketSec' => 30 * 24 * 3600, 'targetPoints' => 3],
            2 => ['rangeSec' => 90 * 24 * 60 * 60, 'bucketSec' => 10 * 24 * 3600, 'targetPoints' => 9],
            4 => ['rangeSec' => 90 * 24 * 60 * 60, 'bucketSec' => 3 * 24 * 3600, 'targetPoints' => 30],
        ],
    ];
    return $plans[$range][$zoom];
}

function normalize_history_quality(string $quality): string
{
    $normalized = strtolower(trim($quality));
    $allowed = ['all', 'normal', 'uncommon', 'special', 'rare', 'exclusive', 'legendary', 'unique', 'unknown'];
    if (!in_array($normalized, $allowed, true)) {
        throw new InvalidArgumentException('Invalid history quality');
    }
    return $normalized;
}

function normalize_history_upgrade(mixed $upgrade): int|string
{
    if (is_string($upgrade) && strtolower(trim($upgrade)) === 'all') {
        return 'all';
    }
    if (is_int($upgrade) || is_float($upgrade) || (is_string($upgrade) && preg_match('/^-?\d+$/', trim($upgrade)))) {
        $value = (int)$upgrade;
        if ($value >= 1 && $value <= 15) {
            return $value;
        }
    }
    throw new InvalidArgumentException('Invalid history upgrade');
}

function normalize_quality_key_from_additional(mixed $additional): string
{
    if (is_array($additional)) {
        $value = $additional['quality'] ?? $additional['qlt'] ?? $additional['grade'] ?? null;
        if ($value !== null) {
            return normalize_quality_key_from_additional($value);
        }
        foreach ($additional as $nested) {
            if (!is_array($nested)) {
                continue;
            }
            $nestedQuality = normalize_quality_key_from_additional($nested);
            if ($nestedQuality !== 'normal') {
                return $nestedQuality;
            }
        }
    }

    if (is_int($additional) || is_float($additional) || (is_string($additional) && preg_match('/^-?\d+$/', trim($additional)))) {
        $n = (int)$additional;
        return match ($n) {
            0 => 'normal',
            1 => 'uncommon',
            2 => 'special',
            3 => 'rare',
            4 => 'exclusive',
            5 => 'legendary',
            6 => 'unique',
            default => 'unknown',
        };
    }

    if (is_string($additional)) {
        $raw = strtolower(trim($additional));
        if ($raw === '') return 'normal';
        $map = [
            'normal' => 'normal',
            'common' => 'normal',
            'обычный' => 'normal',
            'uncommon' => 'uncommon',
            'необычный' => 'uncommon',
            'special' => 'special',
            'особый' => 'special',
            'rare' => 'rare',
            'редкий' => 'rare',
            'exclusive' => 'exclusive',
            'exceptional' => 'exclusive',
            'исключительный' => 'exclusive',
            'legendary' => 'legendary',
            'легендарный' => 'legendary',
            'unique' => 'unique',
            'уникальный' => 'unique',
        ];
        return $map[$raw] ?? 'unknown';
    }

    return 'normal';
}

function normalize_quality_key_from_trade_row(array $row): string
{
    $candidates = [
        $row['quality'] ?? null,
        $row['qlt'] ?? null,
        $row['grade'] ?? null,
        $row['rarity'] ?? null,
        $row['additional'] ?? null,
    ];

    foreach ($candidates as $candidate) {
        if ($candidate === null) {
            continue;
        }
        $normalized = normalize_quality_key_from_additional($candidate);
        // Keep searching only when we could not detect anything explicit.
        if ($normalized !== 'normal' || $candidate === 0 || $candidate === '0' || $candidate === 'normal') {
            return $normalized;
        }
    }

    return 'normal';
}

function normalize_upgrade_level_from_additional(mixed $additional): int
{
    if (is_array($additional)) {
        $value = $additional['ptn'] ?? $additional['upgrade'] ?? $additional['level'] ?? null;
        if ($value !== null) {
            return normalize_upgrade_level_from_additional($value);
        }
        foreach ($additional as $nested) {
            if (!is_array($nested)) {
                continue;
            }
            $nestedUpgrade = normalize_upgrade_level_from_additional($nested);
            if ($nestedUpgrade > 0) {
                return $nestedUpgrade;
            }
        }
    }

    if (is_int($additional) || is_float($additional) || (is_string($additional) && preg_match('/^-?\d+$/', trim($additional)))) {
        $n = (int)$additional;
        return max(0, min(15, $n));
    }

    return 0;
}

function normalize_upgrade_level_from_trade_row(array $row): int
{
    $candidates = [
        $row['ptn'] ?? null,
        $row['upgrade'] ?? null,
        $row['level'] ?? null,
        $row['additional'] ?? null,
    ];
    foreach ($candidates as $candidate) {
        if ($candidate === null) {
            continue;
        }
        $upgrade = normalize_upgrade_level_from_additional($candidate);
        if ($upgrade > 0 || $candidate === 0 || $candidate === '0') {
            return $upgrade;
        }
    }
    return 0;
}

function get_auction_item_history(
    PDO $db,
    string $itemId,
    string $range = '7d',
    string $quality = 'all',
    int $zoom = 1,
    int|string $upgrade = 'all'
): array
{
    $normalizedItemId = trim($itemId);
    if ($normalizedItemId === '') {
        throw new InvalidArgumentException('itemId required');
    }
    $normalizedRange = normalize_history_range($range);
    $normalizedQuality = normalize_history_quality($quality);
    $normalizedZoom = normalize_history_zoom($zoom);
    $normalizedUpgrade = normalize_history_upgrade($upgrade);
    $plan = get_history_plan($normalizedRange, $normalizedZoom);
    $toTs = time();
    $fromTs = $toTs - $plan['rangeSec'];
    $fromUtc = gmdate('Y-m-d H:i:s', $fromTs);
    $toUtc = gmdate('Y-m-d H:i:s', $toTs);
    $buckets = [];
    $filterCondition = '';
    $filterParams = [];
    if ($normalizedQuality !== 'all') {
        $filterCondition .= ' AND quality_key = ?';
        $filterParams[] = $normalizedQuality;
    }
    if ($normalizedUpgrade !== 'all') {
        $filterCondition .= ' AND upgrade_level = ?';
        $filterParams[] = $normalizedUpgrade;
    }

    $addToBucket = static function (array &$acc, int $eventTs, float $qty, float $revenue, int $trades, int $rangeFrom, array $historyPlan): void {
        if ($eventTs < $rangeFrom) return;
        $idx = (int)floor(($eventTs - $rangeFrom) / $historyPlan['bucketSec']);
        if ($idx < 0 || $idx >= $historyPlan['targetPoints']) return;
        $bucketTs = $rangeFrom + $idx * $historyPlan['bucketSec'];
        if (!isset($acc[$bucketTs])) {
            $acc[$bucketTs] = ['totalQty' => 0.0, 'totalRevenue' => 0.0, 'tradeCount' => 0];
        }
        $acc[$bucketTs]['totalQty'] += $qty;
        $acc[$bucketTs]['totalRevenue'] += $revenue;
        $acc[$bucketTs]['tradeCount'] += $trades;
    };

    $rawQuery = static function (PDO $dbConn, string $item, string $startUtc, string $endUtc, string $condition, array $params): array {
        $rawStmt = $dbConn->prepare(
            "SELECT
                DATE_FORMAT(sold_at, '%Y-%m-%d %H:%i:%s') AS event_at,
                amount AS total_qty,
                price AS total_revenue,
                1 AS trade_count
             FROM auction_raw_trades
             WHERE item_id = ?
               AND sold_at >= ?
               AND sold_at < ?
               {$condition}"
        );
        $rawStmt->execute([...[$item, $startUtc, $endUtc], ...$params]);
        return $rawStmt->fetchAll();
    };

    $hourlyQuery = static function (PDO $dbConn, string $item, string $startUtc, string $endUtc, string $condition, array $params): array {
        $hourlyStmt = $dbConn->prepare(
            "SELECT
                DATE_FORMAT(hour_start, '%Y-%m-%d %H:%i:%s') AS event_at,
                total_qty,
                total_revenue,
                trade_count
             FROM auction_hourly_stats
             WHERE item_id = ?
               AND hour_start >= ?
               AND hour_start < ?
               {$condition}"
        );
        $hourlyStmt->execute([...[$item, $startUtc, $endUtc], ...$params]);
        return $hourlyStmt->fetchAll();
    };

    $dailyQuery = static function (PDO $dbConn, string $item, string $startUtc, string $endUtc, string $condition, array $params): array {
        $dailyStmt = $dbConn->prepare(
            "SELECT
                CONCAT(day_date, ' 00:00:00') AS event_at,
                total_qty,
                total_revenue,
                trade_count
             FROM auction_daily_stats
             WHERE item_id = ?
               AND day_date >= DATE(?)
               AND day_date < DATE(?)
               {$condition}"
        );
        $dailyStmt->execute([...[$item, $startUtc, $endUtc], ...$params]);
        return $dailyStmt->fetchAll();
    };

    $rawRows = [];
    $hourlyRows = [];
    $dailyRows = [];
    if ($plan['bucketSec'] < 3600) {
        $rawRows = $rawQuery($db, $normalizedItemId, $fromUtc, $toUtc, $filterCondition, $filterParams);
    } elseif ($plan['bucketSec'] < 86400) {
        $rawStart = max($fromTs, $toTs - 24 * 3600);
        $rawRows = $rawQuery(
            $db,
            $normalizedItemId,
            gmdate('Y-m-d H:i:s', $rawStart),
            $toUtc,
            $filterCondition,
            $filterParams
        );
        $hourlyRows = $hourlyQuery(
            $db,
            $normalizedItemId,
            $fromUtc,
            gmdate('Y-m-d H:i:s', min($toTs, $toTs - 24 * 3600)),
            $filterCondition,
            $filterParams
        );
    } else {
        $rawStart = max($fromTs, $toTs - 24 * 3600);
        $rawRows = $rawQuery(
            $db,
            $normalizedItemId,
            gmdate('Y-m-d H:i:s', $rawStart),
            $toUtc,
            $filterCondition,
            $filterParams
        );
        $dailyCutoffTs = strtotime(gmdate('Y-m-d 00:00:00', $toTs - 8 * 24 * 3600));
        $hourlyRows = $hourlyQuery(
            $db,
            $normalizedItemId,
            gmdate('Y-m-d H:i:s', max($fromTs, $dailyCutoffTs)),
            gmdate('Y-m-d H:i:s', min($toTs, $toTs - 24 * 3600)),
            $filterCondition,
            $filterParams
        );
        $dailyRows = $dailyQuery(
            $db,
            $normalizedItemId,
            $fromUtc,
            gmdate('Y-m-d H:i:s', min($toTs, $dailyCutoffTs)),
            $filterCondition,
            $filterParams
        );
    }

    foreach ([...$dailyRows, ...$hourlyRows, ...$rawRows] as $row) {
        $eventAt = (string)($row['event_at'] ?? '');
        $eventTs = $eventAt !== '' ? (int)strtotime($eventAt . ' UTC') : 0;
        if ($eventTs <= 0) continue;
        $addToBucket(
            $buckets,
            $eventTs,
            (float)($row['total_qty'] ?? 0),
            (float)($row['total_revenue'] ?? 0),
            (int)($row['trade_count'] ?? 0),
            $fromTs,
            $plan
        );
    }

    ksort($buckets);
    $result = [];
    foreach ($buckets as $bucketTs => $row) {
        $totalQty = (float)$row['totalQty'];
        if ($totalQty <= 0.0) {
            continue;
        }
        $totalRevenue = (float)$row['totalRevenue'];
        $tradeCount = (int)$row['tradeCount'];
        $result[] = [
            'ts' => gmdate('Y-m-d H:i:s', (int)$bucketTs),
            'avgPerUnit' => $totalRevenue / $totalQty,
            'totalQty' => $totalQty,
            'totalRevenue' => $totalRevenue,
            'tradeCount' => $tradeCount,
        ];
    }
    return $result;
}

function sync_tracked_item_history(PDO $db, array $config, string $itemId, int $maxPages = 120): array
{
    $normalizedItemId = trim($itemId);
    if ($normalizedItemId === '') {
        throw new InvalidArgumentException('itemId required');
    }

    $base = rtrim((string)($config['auction_api_base_url'] ?? ''), '/');
    $region = strtolower(trim((string)($config['auction_region'] ?? 'ru')));
    $clientId = trim((string)($config['exbo_client_id'] ?? ''));
    $clientSecret = trim((string)($config['exbo_client_secret'] ?? ''));
    if ($base === '' || $clientId === '' || $clientSecret === '') {
        throw new RuntimeException('Missing auction API credentials');
    }

    $headers = [
        'Accept: application/json',
        'Client-Id: ' . $clientId,
        'Client-Secret: ' . $clientSecret,
    ];
    $collectedAt = gmdate('Y-m-d H:i:s');
    $offset = 0;
    $page = 0;
    $seen = 0;
    $inserted = 0;

    while (true) {
        $page += 1;
        $url = sprintf(
            '%s/%s/auction/%s/history?offset=%d&limit=100&additional=true',
            $base,
            $region,
            rawurlencode($normalizedItemId),
            $offset
        );
        $ctx = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => implode("\r\n", $headers),
                'timeout' => 25,
            ],
        ]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) {
            throw new RuntimeException('Auction API request failed while syncing item history');
        }
        $payload = json_decode($raw, true);
        if (!is_array($payload)) {
            throw new RuntimeException('Auction API returned invalid JSON while syncing item history');
        }
        $prices = is_array($payload['prices'] ?? null) ? $payload['prices'] : [];
        if (count($prices) === 0) {
            break;
        }

        foreach ($prices as $rowIndex => $row) {
            $t = strtotime((string)($row['time'] ?? ''));
            if ($t === false) {
                continue;
            }
            $amount = (int)($row['amount'] ?? 0);
            $price = (float)($row['price'] ?? 0);
            if ($amount <= 0 || $price <= 0) {
                continue;
            }
            $soldAt = gmdate('Y-m-d H:i:s', $t);
            $qualityKey = normalize_quality_key_from_trade_row($row);
            $upgradeLevel = normalize_upgrade_level_from_trade_row($row);
            $dedupKey = hash(
                'sha256',
                implode('|', [
                    $normalizedItemId,
                    $qualityKey,
                    (string)$upgradeLevel,
                    $soldAt,
                    (string)$amount,
                    sprintf('%.2f', $price),
                ])
            );
            $didInsert = upsert_auction_raw_trade($db, [
                'itemId' => $normalizedItemId,
                'qualityKey' => $qualityKey,
                'upgradeLevel' => $upgradeLevel,
                'soldAt' => $soldAt,
                'amount' => $amount,
                'price' => $price,
                'sourceOffset' => $offset,
                'sourceRowIndex' => (int)$rowIndex,
                'collectedAt' => $collectedAt,
                'dedupKey' => $dedupKey,
            ]);
            $seen += 1;
            if ($didInsert) {
                $inserted += 1;
            }
        }

        if (count($prices) < 100 || $page >= max(1, $maxPages)) {
            break;
        }
        $offset += 100;
    }

    $defaultWindow = normalize_window_name((string)($config['auction_window_hours'] ?? 12) . 'h');
    recalculate_auction_stat_from_raw($db, $normalizedItemId, $defaultWindow, $collectedAt);
    rebuild_hourly_stats_from_raw_for_item($db, $normalizedItemId, 24);

    return [
        'seenCount' => $seen,
        'insertedCount' => $inserted,
        'window' => $defaultWindow,
    ];
}

function sync_recent_auction_raw_for_item(
    PDO $db,
    array $config,
    string $itemId,
    int $lookbackMinutes = 65,
    int $maxPages = 20
): array {
    $normalizedItemId = trim($itemId);
    if ($normalizedItemId === '') {
        throw new InvalidArgumentException('itemId required');
    }

    $base = rtrim((string)($config['auction_api_base_url'] ?? ''), '/');
    $region = strtolower(trim((string)($config['auction_region'] ?? 'ru')));
    $clientId = trim((string)($config['exbo_client_id'] ?? ''));
    $clientSecret = trim((string)($config['exbo_client_secret'] ?? ''));
    if ($base === '' || $clientId === '' || $clientSecret === '') {
        throw new RuntimeException('Missing auction API credentials');
    }

    $headers = [
        'Accept: application/json',
        'Client-Id: ' . $clientId,
        'Client-Secret: ' . $clientSecret,
    ];

    $cutoffTs = time() - max(1, $lookbackMinutes) * 60;
    $collectedAt = gmdate('Y-m-d H:i:s');
    $offset = 0;
    $page = 0;
    $seen = 0;
    $inserted = 0;

    while (true) {
        $page += 1;
        $url = sprintf(
            '%s/%s/auction/%s/history?offset=%d&limit=100&additional=true',
            $base,
            $region,
            rawurlencode($normalizedItemId),
            $offset
        );
        $ctx = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => implode("\r\n", $headers),
                'timeout' => 25,
            ],
        ]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) {
            throw new RuntimeException('Auction API request failed while syncing recent item history');
        }
        $payload = json_decode($raw, true);
        if (!is_array($payload)) {
            throw new RuntimeException('Auction API returned invalid JSON while syncing recent item history');
        }
        $prices = is_array($payload['prices'] ?? null) ? $payload['prices'] : [];
        if (count($prices) === 0) {
            break;
        }

        $oldestOnPage = PHP_INT_MAX;
        foreach ($prices as $rowIndex => $row) {
            $t = strtotime((string)($row['time'] ?? ''));
            if ($t === false) {
                continue;
            }
            $oldestOnPage = min($oldestOnPage, $t);
            if ($t < $cutoffTs) {
                continue;
            }
            $amount = (int)($row['amount'] ?? 0);
            $price = (float)($row['price'] ?? 0);
            if ($amount <= 0 || $price <= 0) {
                continue;
            }
            $soldAt = gmdate('Y-m-d H:i:s', $t);
            $qualityKey = normalize_quality_key_from_trade_row($row);
            $upgradeLevel = normalize_upgrade_level_from_trade_row($row);
            $dedupKey = hash(
                'sha256',
                implode('|', [
                    $normalizedItemId,
                    $qualityKey,
                    (string)$upgradeLevel,
                    $soldAt,
                    (string)$amount,
                    sprintf('%.2f', $price),
                ])
            );

            $didInsert = upsert_auction_raw_trade($db, [
                'itemId' => $normalizedItemId,
                'qualityKey' => $qualityKey,
                'upgradeLevel' => $upgradeLevel,
                'soldAt' => $soldAt,
                'amount' => $amount,
                'price' => $price,
                'sourceOffset' => $offset,
                'sourceRowIndex' => (int)$rowIndex,
                'collectedAt' => $collectedAt,
                'dedupKey' => $dedupKey,
            ]);
            $seen += 1;
            if ($didInsert) {
                $inserted += 1;
            }
        }

        if (count($prices) < 100 || $page >= max(1, $maxPages) || $oldestOnPage < $cutoffTs) {
            break;
        }
        $offset += 100;
    }

    return [
        'seenCount' => $seen,
        'insertedCount' => $inserted,
    ];
}

function get_auction_item_active_lots(PDO $db, array $config, string $itemId, int $limit = 100): array
{
    $normalizedItemId = trim($itemId);
    if ($normalizedItemId === '') {
        throw new InvalidArgumentException('itemId required');
    }

    $base = rtrim((string)($config['auction_api_base_url'] ?? ''), '/');
    $region = strtolower(trim((string)($config['auction_region'] ?? 'ru')));
    $clientId = trim((string)($config['exbo_client_id'] ?? ''));
    $clientSecret = trim((string)($config['exbo_client_secret'] ?? ''));
    if ($base === '' || $clientId === '' || $clientSecret === '') {
        throw new RuntimeException('Missing auction API credentials');
    }

    $headers = [
        'Accept: application/json',
        'Client-Id: ' . $clientId,
        'Client-Secret: ' . $clientSecret,
    ];
    $safeLimit = max(1, min(200, $limit));
    $url = sprintf(
        '%s/%s/auction/%s/lots?offset=0&limit=%d&additional=true',
        $base,
        $region,
        rawurlencode($normalizedItemId),
        $safeLimit
    );
    $headers[] = 'Cache-Control: no-cache';
    $headers[] = 'Pragma: no-cache';
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => implode("\r\n", $headers),
            'timeout' => 25,
            'ignore_errors' => true,
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) {
        throw new RuntimeException('Auction API request failed while loading active lots');
    }
    $statusLine = (string)($http_response_header[0] ?? '');
    if (preg_match('/\s(\d{3})\s/', $statusLine, $m)) {
        $statusCode = (int)$m[1];
        if ($statusCode >= 400) {
            throw new RuntimeException('Auction API returned HTTP ' . $statusCode . ' while loading active lots');
        }
    }
    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
        throw new RuntimeException('Auction API returned invalid JSON while loading active lots');
    }

    $rows = [];
    foreach (['lots', 'items', 'offers'] as $key) {
        $candidate = $payload[$key] ?? null;
        if (is_array($candidate) && count($candidate) > 0) {
            $rows = $candidate;
            break;
        }
    }
    if (count($rows) === 0 && isset($payload['data']) && is_array($payload['data'])) {
        $inner = $payload['data'];
        foreach (['lots', 'items', 'offers'] as $key) {
            $candidate = $inner[$key] ?? null;
            if (is_array($candidate) && count($candidate) > 0) {
                $rows = $candidate;
                break;
            }
        }
    }

    $normalizeTs = static function (mixed $raw): string {
        if ($raw === null) return '';
        if (is_int($raw) || is_float($raw) || (is_string($raw) && preg_match('/^\d+$/', trim($raw)))) {
            $n = (int)$raw;
            if ($n > 0) {
                // Support milliseconds epoch if provided.
                if ($n > 9999999999) {
                    $n = (int)floor($n / 1000);
                }
                return gmdate('Y-m-d H:i:s', $n);
            }
        }
        $s = trim((string)$raw);
        if ($s === '') return '';
        $t = strtotime($s);
        if ($t === false || $t <= 0) return '';
        return gmdate('Y-m-d H:i:s', $t);
    };

    $normalized = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $amount = (int)($row['amount'] ?? $row['qty'] ?? 0);
        $buyoutPriceTotal = (float)($row['price'] ?? $row['buyoutPrice'] ?? $row['buyout_cost'] ?? $row['cost'] ?? 0);
        $startPriceTotal = (float)($row['startPrice'] ?? $row['start_price'] ?? $row['currentPrice'] ?? $row['minPrice'] ?? 0);
        $price = $buyoutPriceTotal > 0 ? $buyoutPriceTotal : $startPriceTotal;
        if ($amount <= 0 || $price <= 0) {
            continue;
        }
        $placedAt = $normalizeTs($row['time'] ?? $row['createdAt'] ?? $row['placedAt'] ?? $row['placed_at'] ?? null);
        $expiresAt = $normalizeTs(
            $row['expiresAt'] ?? $row['expireAt'] ?? $row['expirationTime'] ?? $row['expires_at'] ?? $row['endTime'] ?? null
        );
        if ($expiresAt === '' && isset($row['remainingTimeSec'])) {
            $expiresAt = gmdate('Y-m-d H:i:s', time() + max(0, (int)$row['remainingTimeSec']));
        }

        $statusRaw = strtolower(trim((string)($row['status'] ?? $row['state'] ?? $row['lotStatus'] ?? '')));
        if (
            $statusRaw !== '' &&
            in_array($statusRaw, ['sold', 'closed', 'cancelled', 'expired', 'finished', 'removed', 'bought'], true)
        ) {
            continue;
        }
        if (array_key_exists('active', $row) && $row['active'] === false) {
            continue;
        }
        if (!empty($row['removed']) || !empty($row['isRemoved'])) {
            continue;
        }

        if ($expiresAt !== '') {
            $exp = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $expiresAt, new \DateTimeZone('UTC'));
            if ($exp instanceof \DateTimeImmutable && $exp->getTimestamp() < time() - 30) {
                continue;
            }
        }

        $additional = is_array($row['additional'] ?? null) ? $row['additional'] : null;
        $buyoutPerUnit = $amount > 0 ? ($buyoutPriceTotal > 0 ? $buyoutPriceTotal / $amount : 0.0) : 0.0;
        $startPerUnit = $amount > 0 ? ($startPriceTotal > 0 ? $startPriceTotal / $amount : 0.0) : 0.0;
        $normalized[] = [
            'amount' => $amount,
            'price' => $price / $amount,
            'startPrice' => $startPerUnit > 0 ? $startPerUnit : null,
            'buyoutPrice' => $buyoutPerUnit > 0 ? $buyoutPerUnit : null,
            'placedAt' => $placedAt,
            'expiresAt' => $expiresAt,
            'quality' => normalize_quality_key_from_trade_row($row),
            'upgrade' => normalize_upgrade_level_from_trade_row($row),
            'additional' => $additional,
        ];
    }

    usort($normalized, static fn(array $a, array $b): int => (int)($a['price'] <=> $b['price']));
    return $normalized;
}

/**
 * Weighted average price per unit over the last N raw trades (all qualities), ordered by sold_at DESC.
 *
 * @return array{tradeCount:int, avgPerUnit:float|null, sampleCap:int}
 */
function auction_aggregate_last_n_raw_trades(PDO $db, string $itemId, int $n): array
{
    $allowed = [50, 100, 200, 500, 1000];
    if (!in_array($n, $allowed, true)) {
        $n = 100;
    }
    $stmt = $db->prepare(
        'SELECT
            COALESCE(SUM(x.price), 0) AS rev,
            COALESCE(SUM(x.amount), 0) AS qty,
            COUNT(*) AS cnt
         FROM (
            SELECT price, amount
            FROM auction_raw_trades
            WHERE item_id = ?
            ORDER BY sold_at DESC
            LIMIT ' . (string)$n . '
         ) x'
    );
    $stmt->execute([$itemId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $cnt = $row ? (int)$row['cnt'] : 0;
    $qty = $row ? (float)$row['qty'] : 0.0;
    $rev = $row ? (float)$row['rev'] : 0.0;
    $avg = $cnt > 0 && $qty > 0.0 ? $rev / $qty : null;
    return ['tradeCount' => $cnt, 'avgPerUnit' => $avg, 'sampleCap' => $n];
}

/**
 * @return array<string, mixed>
 */
function auction_hybrid_price_last_sales_for_item(PDO $db, string $itemId, array $settings): array
{
    $minTr = (int)$settings['minTrades'];
    $presets = [50, 100, 200, 500, 1000];
    $requested = (int)$settings['lastSalesCount'];
    $startIdx = 0;
    foreach ($presets as $i => $p) {
        if ($p >= $requested) {
            $startIdx = $i;
            break;
        }
    }
    $expanded = false;
    $expansionMessage = null;
    $lastAgg = null;
    for ($i = $startIdx; $i < count($presets); $i++) {
        $n = $presets[$i];
        $agg = auction_aggregate_last_n_raw_trades($db, $itemId, $n);
        $lastAgg = $agg;
        if ($i > $startIdx) {
            $expanded = true;
        }
        $sufficient = $agg['tradeCount'] >= $minTr;
        $atMax = $i === count($presets) - 1;
        if ($sufficient || $atMax) {
            if ($expanded) {
                if ($sufficient) {
                    $expansionMessage = sprintf(
                        'Окно расширено: для «%d последних продаж» сделок было меньше порога (%d); использованы последние %d продаж (%d сделок).',
                        $requested,
                        $minTr,
                        $n,
                        $agg['tradeCount']
                    );
                } else {
                    $expansionMessage = sprintf(
                        'Окно расширено до %d последних продаж; сделок всё ещё меньше порога (%d при необходимости %d).',
                        $n,
                        $agg['tradeCount'],
                        $minTr
                    );
                }
            }
            $undersampled = !$sufficient && $agg['tradeCount'] > 0;
            return [
                'avgPerUnit' => $agg['avgPerUnit'],
                'tradeCount' => $agg['tradeCount'],
                'sampleSize' => $agg['sampleCap'],
                'windowUsed' => 'last_' . $n,
                'windowRequested' => 'last_' . $requested,
                'expandedWindow' => $expanded,
                'undersampled' => $undersampled,
                'expansionMessage' => $expansionMessage,
                'statsFetchedAt' => null,
            ];
        }
    }
    $agg = $lastAgg ?? auction_aggregate_last_n_raw_trades($db, $itemId, 100);
    return [
        'avgPerUnit' => $agg['avgPerUnit'],
        'tradeCount' => $agg['tradeCount'],
        'sampleSize' => $agg['sampleCap'],
        'windowUsed' => 'last_' . $agg['sampleCap'],
        'windowRequested' => 'last_' . $requested,
        'expandedWindow' => false,
        'undersampled' => $agg['tradeCount'] < $minTr && $agg['tradeCount'] > 0,
        'expansionMessage' => null,
        'statsFetchedAt' => null,
    ];
}

/**
 * @param array<string, mixed> $settings normalized hybrid settings
 * @return array{fetchedAt:string, settings:array, items:array<string, array<string, mixed>>}
 */
function get_auction_hybrid_prices_bulk(PDO $db, array $itemIds, array $settings): array
{
    $settings = normalize_auction_hybrid_settings_array($settings);
    $fetchedAt = gmdate('c');
    $items = [];

    if ($settings['mode'] === 'last_sales') {
        foreach ($itemIds as $itemId) {
            $items[$itemId] = auction_hybrid_price_last_sales_for_item($db, (string)$itemId, $settings);
        }
        return ['fetchedAt' => $fetchedAt, 'settings' => $settings, 'items' => $items];
    }

    $windows = auction_hybrid_time_windows();
    $requestedW = (string)$settings['timeWindow'];
    $startIdx = 0;
    foreach ($windows as $i => $w) {
        if ($w === $requestedW) {
            $startIdx = $i;
            break;
        }
    }
    $minTr = (int)$settings['minTrades'];
    $remaining = $itemIds;

    for ($i = $startIdx; $i < count($windows); $i++) {
        $w = $windows[$i];
        if (count($remaining) > 0) {
            ensure_auction_stats_for_items($db, $remaining, $w);
        }
        $stats = count($remaining) > 0 ? get_auction_stats($db, $remaining, $w) : [];
        $nextRemaining = [];
        foreach ($remaining as $itemId) {
            $row = $stats[$itemId] ?? null;
            $tc = $row ? (int)$row['tradeCount'] : 0;
            $avg = $row && $row['avgPerUnit'] !== null ? (float)$row['avgPerUnit'] : null;
            $sufficient = $tc >= $minTr && $avg !== null && $avg > 0.0;
            $expanded = $i > $startIdx;
            $atMax = $i === count($windows) - 1;
            if ($sufficient || $atMax) {
                $expansionMessage = null;
                if ($expanded) {
                    if ($sufficient) {
                        $expansionMessage = sprintf(
                            'Окно расширено: для периода «%s» сделок было меньше порога (%d); использован агрегат за «%s» (%d сделок).',
                            $requestedW,
                            $minTr,
                            $w,
                            $tc
                        );
                    } else {
                        $expansionMessage = sprintf(
                            'Окно расширено до «%s»; сделок всё ещё меньше порога (%d при необходимости %d).',
                            $w,
                            $tc,
                            $minTr
                        );
                    }
                }
                $statsFetchedAt = ($row !== null && isset($row['fetchedAt'])) ? $row['fetchedAt'] : null;
                $items[$itemId] = [
                    'avgPerUnit' => $avg,
                    'tradeCount' => $tc,
                    'sampleSize' => $tc,
                    'windowUsed' => $w,
                    'windowRequested' => $requestedW,
                    'expandedWindow' => $expanded,
                    'undersampled' => !$sufficient && $tc > 0,
                    'expansionMessage' => $expansionMessage,
                    'statsFetchedAt' => $statsFetchedAt,
                ];
            } else {
                $nextRemaining[] = $itemId;
            }
        }
        $remaining = $nextRemaining;
        if (count($remaining) === 0) {
            break;
        }
    }

    foreach ($itemIds as $itemId) {
        if (!isset($items[$itemId])) {
            $items[$itemId] = [
                'avgPerUnit' => null,
                'tradeCount' => 0,
                'sampleSize' => 0,
                'windowUsed' => $requestedW,
                'windowRequested' => $requestedW,
                'expandedWindow' => false,
                'undersampled' => false,
                'expansionMessage' => null,
                'statsFetchedAt' => null,
            ];
        }
    }

    return ['fetchedAt' => $fetchedAt, 'settings' => $settings, 'items' => $items];
}

