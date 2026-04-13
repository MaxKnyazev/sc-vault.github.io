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
          (item_id, sold_at, amount, price, source_offset, source_row_index, collected_at, dedup_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE dedup_key = dedup_key'
    );
    $stmt->execute([
        $trade['itemId'],
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
          (item_id, hour_start, total_qty, total_revenue, trade_count, avg_per_unit, source_min_sold_at, source_max_sold_at, fetched_at, updated_at)
         SELECT
          item_id,
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
         GROUP BY item_id, DATE_FORMAT(sold_at, '%Y-%m-%d %H:00:00')
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
                  (item_id, day_date, total_qty, total_revenue, trade_count, avg_per_unit, source_hours_count, fetched_at, updated_at)
                 SELECT
                  item_id,
                  DATE(hour_start) AS day_date,
                  COALESCE(SUM(total_qty), 0) AS total_qty,
                  COALESCE(SUM(total_revenue), 0) AS total_revenue,
                  COALESCE(SUM(trade_count), 0) AS trade_count,
                  CASE WHEN COALESCE(SUM(total_qty), 0) > 0 THEN COALESCE(SUM(total_revenue), 0) / SUM(total_qty) ELSE NULL END AS avg_per_unit,
                  COUNT(*) AS source_hours_count,
                  UTC_TIMESTAMP() AS fetched_at,
                  UTC_TIMESTAMP() AS updated_at
                 FROM (
                    SELECT item_id, hour_start, total_qty, total_revenue, trade_count
                    FROM auction_hourly_stats
                    WHERE hour_start < {$cutoffExpr}
                    ORDER BY hour_start
                    LIMIT {$limit}
                 ) AS batch
                 GROUP BY item_id, DATE(hour_start)
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

function get_auction_item_history(PDO $db, string $itemId, string $range = '7d'): array
{
    $normalizedItemId = trim($itemId);
    if ($normalizedItemId === '') {
        throw new InvalidArgumentException('itemId required');
    }
    $normalizedRange = normalize_history_range($range);
    $points = [];
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
             GROUP BY DATE_FORMAT(sold_at, '%Y-%m-%d %H:00:00')"
        );
        $rawStmt->execute([$normalizedItemId]);
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
                 GROUP BY DATE_FORMAT(hour_start, '%Y-%m-%d %H:00:00')"
            );
            $hourlyStmt->execute([$normalizedItemId]);
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
             GROUP BY DATE(sold_at)"
        );
        $rawStmt->execute([$normalizedItemId]);
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
             GROUP BY DATE(hour_start)"
        );
        $hourlyStmt->execute([$normalizedItemId]);
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
             GROUP BY day_date"
        );
        $dailyStmt->execute([$normalizedItemId]);
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

