<?php

declare(strict_types=1);

function get_tracked_desired_buy_prices(PDO $db, int $userId): array
{
    $stmt = $db->prepare(
        'SELECT item_id, desired_buy_price FROM auction_tracked_desired_buy_prices WHERE user_id = ?',
    );
    $stmt->execute([$userId]);
    $out = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $itemId = (string)($row['item_id'] ?? '');
        if ($itemId === '') {
            continue;
        }
        $out[$itemId] = ['value' => (string)($row['desired_buy_price'] ?? '')];
    }
    return $out;
}

function upsert_tracked_desired_buy_price(PDO $db, int $userId, string $itemId, string $value): void
{
    $stmt = $db->prepare(
        'INSERT INTO auction_tracked_desired_buy_prices (user_id, item_id, desired_buy_price, updated_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE desired_buy_price = VALUES(desired_buy_price), updated_at = NOW()',
    );
    $stmt->execute([$userId, $itemId, $value]);
}

function delete_tracked_desired_buy_price(PDO $db, int $userId, string $itemId): void
{
    $stmt = $db->prepare(
        'DELETE FROM auction_tracked_desired_buy_prices WHERE user_id = ? AND item_id = ?',
    );
    $stmt->execute([$userId, $itemId]);
}
