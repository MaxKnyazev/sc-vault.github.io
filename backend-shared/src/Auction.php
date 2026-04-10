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

