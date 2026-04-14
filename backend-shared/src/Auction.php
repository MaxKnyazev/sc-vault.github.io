<?php

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
          (item_id, quality_key, sold_at, amount, price, source_offset, source_row_index, collected_at, dedup_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE dedup_key = dedup_key'
    );
    $stmt->execute([
        $trade['itemId'],
        $trade['qualityKey'],
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
          (item_id, quality_key, hour_start, total_qty, total_revenue, trade_count, avg_per_unit, source_min_sold_at, source_max_sold_at, fetched_at, updated_at)
         SELECT
          item_id,
          quality_key,
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
         GROUP BY item_id, quality_key, DATE_FORMAT(sold_at, '%Y-%m-%d %H:00:00')
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
    $cutoffExpr = sprintf('UTC_TIMESTAMP() - INTERVAL %d DAY', $days);
    $limit = max(1000, $batchSize);

    $upsertedRows = 0;
    $deletedHourlyRows = 0;

    while (true) {
        $db->beginTransaction();
        try {
            $insertStmt = $db->prepare(
                "INSERT INTO auction_daily_stats
                  (item_id, quality_key, day_date, total_qty, total_revenue, trade_count, avg_per_unit, source_hours_count, fetched_at, updated_at)
                 SELECT
                  item_id,
                  quality_key,
                  DATE(hour_start) AS day_date,
                  COALESCE(SUM(total_qty), 0) AS total_qty,
                  COALESCE(SUM(total_revenue), 0) AS total_revenue,
                  COALESCE(SUM(trade_count), 0) AS trade_count,
                  CASE WHEN COALESCE(SUM(total_qty), 0) > 0 THEN COALESCE(SUM(total_revenue), 0) / SUM(total_qty) ELSE NULL END AS avg_per_unit,
                  COUNT(*) AS source_hours_count,
                  UTC_TIMESTAMP() AS fetched_at,
                  UTC_TIMESTAMP() AS updated_at
                 FROM (
                    SELECT item_id, quality_key, hour_start, total_qty, total_revenue, trade_count
                    FROM auction_hourly_stats
                    WHERE hour_start < {$cutoffExpr}
                    ORDER BY hour_start
                    LIMIT {$limit}
                 ) AS batch
                 GROUP BY item_id, quality_key, DATE(hour_start)
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
    $allowed = ['24h', '7d', '30d', '90d'];
    if (!in_array($normalized, $allowed, true)) {
        throw new InvalidArgumentException('Invalid history range');
    }
    return $normalized;
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
            0, 1 => 'normal',
            2 => 'uncommon',
            3 => 'special',
            4 => 'rare',
            5 => 'exclusive',
            6 => 'legendary',
            7 => 'unique',
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

function get_auction_item_history(PDO $db, string $itemId, string $range = '7d', string $quality = 'all'): array
{
    $normalizedItemId = trim($itemId);
    if ($normalizedItemId === '') {
        throw new InvalidArgumentException('itemId required');
    }
    $normalizedRange = normalize_history_range($range);
    $normalizedQuality = normalize_history_quality($quality);
    $points = [];
    $qualityCondition = '';
    $qualityParams = [];
    if ($normalizedQuality !== 'all') {
        $qualityCondition = ' AND quality_key = ?';
        $qualityParams[] = $normalizedQuality;
    }
    $push = static function (array &$acc, string $bucket, float $qty, float $revenue, int $trades): void {
        if (!isset($acc[$bucket])) {
            $acc[$bucket] = ['totalQty' => 0.0, 'totalRevenue' => 0.0, 'tradeCount' => 0];
        }
        $acc[$bucket]['totalQty'] += $qty;
        $acc[$bucket]['totalRevenue'] += $revenue;
        $acc[$bucket]['tradeCount'] += $trades;
    };

    if ($normalizedRange === '24h' || $normalizedRange === '7d') {
        $hours = $normalizedRange === '24h' ? 24 : 24 * 7;
        $rawStmt = $db->prepare(
            "SELECT
                DATE_FORMAT(sold_at, '%Y-%m-%d %H:00:00') AS bucket_ts,
                COALESCE(SUM(amount), 0) AS total_qty,
                COALESCE(SUM(price), 0) AS total_revenue,
                COUNT(*) AS trade_count
             FROM auction_raw_trades
             WHERE item_id = ?
               AND sold_at >= UTC_TIMESTAMP() - INTERVAL {$hours} HOUR
               {$qualityCondition}
             GROUP BY DATE_FORMAT(sold_at, '%Y-%m-%d %H:00:00')"
        );
        $rawStmt->execute([...[$normalizedItemId], ...$qualityParams]);
        foreach ($rawStmt->fetchAll() as $row) {
            $push(
                $points,
                (string)$row['bucket_ts'],
                (float)$row['total_qty'],
                (float)$row['total_revenue'],
                (int)$row['trade_count']
            );
        }

        if ($normalizedRange === '7d') {
            $hourlyStmt = $db->prepare(
                "SELECT
                    DATE_FORMAT(hour_start, '%Y-%m-%d %H:00:00') AS bucket_ts,
                    COALESCE(SUM(total_qty), 0) AS total_qty,
                    COALESCE(SUM(total_revenue), 0) AS total_revenue,
                    COALESCE(SUM(trade_count), 0) AS trade_count
                 FROM auction_hourly_stats
                 WHERE item_id = ?
                   AND hour_start >= UTC_TIMESTAMP() - INTERVAL 7 DAY
                   AND hour_start < UTC_TIMESTAMP() - INTERVAL 24 HOUR
                   {$qualityCondition}
                 GROUP BY DATE_FORMAT(hour_start, '%Y-%m-%d %H:00:00')"
            );
            $hourlyStmt->execute([...[$normalizedItemId], ...$qualityParams]);
            foreach ($hourlyStmt->fetchAll() as $row) {
                $push(
                    $points,
                    (string)$row['bucket_ts'],
                    (float)$row['total_qty'],
                    (float)$row['total_revenue'],
                    (int)$row['trade_count']
                );
            }
        }
    } else {
        $days = $normalizedRange === '30d' ? 30 : 90;
        $rawStmt = $db->prepare(
            "SELECT
                DATE_FORMAT(DATE(sold_at), '%Y-%m-%d 00:00:00') AS bucket_ts,
                COALESCE(SUM(amount), 0) AS total_qty,
                COALESCE(SUM(price), 0) AS total_revenue,
                COUNT(*) AS trade_count
             FROM auction_raw_trades
             WHERE item_id = ?
               AND sold_at >= UTC_DATE() - INTERVAL {$days} DAY
               {$qualityCondition}
             GROUP BY DATE(sold_at)"
        );
        $rawStmt->execute([...[$normalizedItemId], ...$qualityParams]);
        foreach ($rawStmt->fetchAll() as $row) {
            $push(
                $points,
                (string)$row['bucket_ts'],
                (float)$row['total_qty'],
                (float)$row['total_revenue'],
                (int)$row['trade_count']
            );
        }

        $hourlyStmt = $db->prepare(
            "SELECT
                DATE_FORMAT(DATE(hour_start), '%Y-%m-%d 00:00:00') AS bucket_ts,
                COALESCE(SUM(total_qty), 0) AS total_qty,
                COALESCE(SUM(total_revenue), 0) AS total_revenue,
                COALESCE(SUM(trade_count), 0) AS trade_count
             FROM auction_hourly_stats
             WHERE item_id = ?
               AND hour_start >= UTC_DATE() - INTERVAL {$days} DAY
               AND hour_start < UTC_TIMESTAMP() - INTERVAL 24 HOUR
               {$qualityCondition}
             GROUP BY DATE(hour_start)"
        );
        $hourlyStmt->execute([...[$normalizedItemId], ...$qualityParams]);
        foreach ($hourlyStmt->fetchAll() as $row) {
            $push(
                $points,
                (string)$row['bucket_ts'],
                (float)$row['total_qty'],
                (float)$row['total_revenue'],
                (int)$row['trade_count']
            );
        }

        $dailyStmt = $db->prepare(
            "SELECT
                DATE_FORMAT(day_date, '%Y-%m-%d 00:00:00') AS bucket_ts,
                COALESCE(SUM(total_qty), 0) AS total_qty,
                COALESCE(SUM(total_revenue), 0) AS total_revenue,
                COALESCE(SUM(trade_count), 0) AS trade_count
             FROM auction_daily_stats
             WHERE item_id = ?
               AND day_date >= UTC_DATE() - INTERVAL {$days} DAY
               AND day_date < UTC_DATE() - INTERVAL 7 DAY
               {$qualityCondition}
             GROUP BY day_date"
        );
        $dailyStmt->execute([...[$normalizedItemId], ...$qualityParams]);
        foreach ($dailyStmt->fetchAll() as $row) {
            $push(
                $points,
                (string)$row['bucket_ts'],
                (float)$row['total_qty'],
                (float)$row['total_revenue'],
                (int)$row['trade_count']
            );
        }
    }

    ksort($points);
    $result = [];
    foreach ($points as $bucketTs => $row) {
        $totalQty = (float)$row['totalQty'];
        $totalRevenue = (float)$row['totalRevenue'];
        $tradeCount = (int)$row['tradeCount'];
        $result[] = [
            'ts' => $bucketTs,
            'avgPerUnit' => $totalQty > 0 ? $totalRevenue / $totalQty : null,
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
            $dedupKey = hash(
                'sha256',
                implode('|', [
                    $normalizedItemId,
                    $qualityKey,
                    $soldAt,
                    (string)$amount,
                    sprintf('%.2f', $price),
                    (string)$offset,
                    (string)$rowIndex,
                ])
            );
            $didInsert = upsert_auction_raw_trade($db, [
                'itemId' => $normalizedItemId,
                'qualityKey' => $qualityKey,
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

