<?php

function get_tracked_auction_item_ids(PDO $db): array
{
    $stmt = $db->query('SELECT item_id FROM auction_tracked_items ORDER BY created_at ASC');
    $rows = $stmt->fetchAll();
    $ids = [];
    foreach ($rows as $row) {
        $ids[] = (string)$row['item_id'];
    }
    return $ids;
}

function add_tracked_auction_item(PDO $db, string $itemId, ?int $userId): void
{
    $normalized = trim($itemId);
    if ($normalized === '') {
        throw new InvalidArgumentException('itemId required');
    }
    $stmt = $db->prepare(
        'INSERT INTO auction_tracked_items (item_id, added_by_user_id, created_at)
         VALUES (?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE item_id = item_id'
    );
    $stmt->execute([$normalized, $userId]);
}

function remove_tracked_auction_item(PDO $db, string $itemId): void
{
    $normalized = trim($itemId);
    if ($normalized === '') {
        throw new InvalidArgumentException('itemId required');
    }
    $stmt = $db->prepare('DELETE FROM auction_tracked_items WHERE item_id = ?');
    $stmt->execute([$normalized]);
}

