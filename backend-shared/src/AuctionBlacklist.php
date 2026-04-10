<?php

function get_auction_blacklist_item_ids(PDO $db): array
{
    $stmt = $db->query('SELECT item_id FROM auction_item_blacklist');
    $rows = $stmt->fetchAll();
    $ids = [];
    foreach ($rows as $row) {
        $ids[] = (string)$row['item_id'];
    }
    return $ids;
}

function add_auction_blacklist_item(PDO $db, string $itemId, ?int $adminUserId): void
{
    $normalized = trim($itemId);
    if ($normalized === '') {
        throw new InvalidArgumentException('itemId required');
    }

    $stmt = $db->prepare(
        'INSERT INTO auction_item_blacklist (item_id, created_by_user_id, created_at)
         VALUES (?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE item_id = item_id'
    );
    $stmt->execute([$normalized, $adminUserId]);
}

function filter_item_ids_not_blacklisted(PDO $db, array $itemIds): array
{
    if (count($itemIds) === 0) {
        return [];
    }
    $blacklisted = array_flip(get_auction_blacklist_item_ids($db));
    $out = [];
    foreach ($itemIds as $id) {
        $id = trim((string)$id);
        if ($id === '' || isset($blacklisted[$id])) {
            continue;
        }
        $out[] = $id;
    }
    return array_values(array_unique($out));
}
