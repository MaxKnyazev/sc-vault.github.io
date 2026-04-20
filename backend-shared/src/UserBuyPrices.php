<?php

function get_user_buy_prices(PDO $db, int $userId): array
{
    $stmt = $db->prepare('SELECT item_id, buy_price, updated_at FROM user_buy_prices WHERE user_id = ?');
    $stmt->execute([$userId]);
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

function upsert_user_buy_price(PDO $db, int $userId, string $itemId, string $value): void
{
    $stmt = $db->prepare(
        'INSERT INTO user_buy_prices (user_id, item_id, buy_price, updated_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           buy_price = VALUES(buy_price),
           updated_at = UTC_TIMESTAMP()'
    );
    $stmt->execute([$userId, $itemId, $value]);
}

function delete_user_buy_price(PDO $db, int $userId, string $itemId): void
{
    $stmt = $db->prepare('DELETE FROM user_buy_prices WHERE user_id = ? AND item_id = ?');
    $stmt->execute([$userId, $itemId]);
}

