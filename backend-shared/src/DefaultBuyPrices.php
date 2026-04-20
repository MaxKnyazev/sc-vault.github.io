<?php

function get_default_buy_prices(PDO $db): array
{
    $stmt = $db->query('SELECT item_id, buy_price, updated_at FROM default_buy_prices');
    $rows = $stmt->fetchAll();
    $result = [];
    foreach ($rows as $row) {
        $result[$row['item_id']] = [
            'value' => (string)$row['buy_price'],
            'updatedAt' => $row['updated_at'],
        ];
    }
    return $result;
}

function upsert_default_buy_price(PDO $db, string $itemId, string $value): void
{
    $stmt = $db->prepare(
        'INSERT INTO default_buy_prices (item_id, buy_price, updated_at)
         VALUES (?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           buy_price = VALUES(buy_price),
           updated_at = UTC_TIMESTAMP()'
    );
    $stmt->execute([$itemId, $value]);
}

function delete_default_buy_price(PDO $db, string $itemId): void
{
    $stmt = $db->prepare('DELETE FROM default_buy_prices WHERE item_id = ?');
    $stmt->execute([$itemId]);
}

function get_effective_buy_prices_for_user(PDO $db, int $userId): array
{
    $defaults = get_default_buy_prices($db);
    $overrides = get_user_buy_prices($db, $userId);
    $itemIds = array_values(array_unique(array_merge(array_keys($defaults), array_keys($overrides))));
    $result = [];
    foreach ($itemIds as $itemId) {
        if (array_key_exists($itemId, $overrides)) {
            $result[$itemId] = $overrides[$itemId];
        } else {
            $result[$itemId] = $defaults[$itemId];
        }
    }
    return $result;
}
