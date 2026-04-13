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

function purge_raw_trades_older_than_hours(PDO $db, int $rawRetentionHours): int
{
    $hours = max(1, $rawRetentionHours);
    $cutoffExpr = sprintf('UTC_TIMESTAMP() - INTERVAL %d HOUR', $hours);
    $stmt = $db->prepare("DELETE FROM auction_raw_trades WHERE sold_at < {$cutoffExpr}");
    $stmt->execute();
    return $stmt->rowCount();
}

function rollup_hourly_to_daily_and_purge(PDO $db, int $hourlyRetentionDays): array
{
    $days = max(1, $hourlyRetentionDays);
    $cutoffExpr = sprintf('UTC_TIMESTAMP() - INTERVAL %d DAY', $days);

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
             FROM auction_hourly_stats
             WHERE hour_start < {$cutoffExpr}
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
        $upsertedRows = $insertStmt->rowCount();

        $deleteStmt = $db->prepare("DELETE FROM auction_hourly_stats WHERE hour_start < {$cutoffExpr}");
        $deleteStmt->execute();
        $deletedHourlyRows = $deleteStmt->rowCount();

        $db->commit();
        return [
            'upsertedDailyRows' => $upsertedRows,
            'deletedHourlyRows' => $deletedHourlyRows,
        ];
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
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

