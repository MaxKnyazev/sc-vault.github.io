<?php

declare(strict_types=1);

function normalize_subscription_kind(string $raw): string
{
    $k = strtolower(trim($raw));
    if (!in_array($k, ['core', 'artifact'], true)) {
        throw new InvalidArgumentException('Unsupported kind: ' . $raw);
    }
    return $k;
}

function normalize_subscription_quality(string $raw, string $kind): string
{
    $q = strtolower(trim($raw));
    $core = ['normal', 'uncommon', 'special', 'rare', 'exclusive', 'legendary'];
    $artifact = ['normal', 'uncommon', 'special', 'rare', 'exclusive', 'legendary', 'unique'];
    $allowed = $kind === 'artifact' ? $artifact : $core;
    if (!in_array($q, $allowed, true)) {
        throw new InvalidArgumentException('Unsupported quality: ' . $raw);
    }
    return $q;
}

function normalize_subscription_upgrade_range(string $kind, $minRaw, $maxRaw): array
{
    if ($kind === 'core') {
        return ['min' => -1, 'max' => -1];
    }
    $min = (int)$minRaw;
    $max = (int)$maxRaw;
    if ($min < 0 || $min > 15 || $max < 0 || $max > 15 || $min > $max) {
        throw new InvalidArgumentException('upgrade range must be 0..15 and min<=max');
    }
    return ['min' => $min, 'max' => $max];
}

function normalize_subscription_desired_price(string $raw): string
{
    $digits = preg_replace('/\D+/', '', $raw) ?? '';
    if ($digits === '') {
        return '';
    }
    if (strlen($digits) > 32) {
        throw new InvalidArgumentException('Слишком длинное значение цены');
    }
    return $digits;
}

/**
 * @return array<int, array{itemId: string, kind: string, quality: string, upgradeMin: int, upgradeMax: int, desiredBuyPrice: string}>
 */
function get_user_tracked_item_subscriptions(PDO $db, int $userId): array
{
    $stmt = $db->prepare(
        'SELECT item_id, kind, quality, upgrade_min, upgrade_max, desired_buy_price
         FROM auction_user_tracked_item_subscriptions
         WHERE user_id = ?
         ORDER BY item_id ASC, kind ASC, quality ASC, upgrade_min ASC, upgrade_max ASC',
    );
    $stmt->execute([$userId]);
    $out = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $out[] = [
            'itemId' => (string)($row['item_id'] ?? ''),
            'kind' => (string)($row['kind'] ?? ''),
            'quality' => (string)($row['quality'] ?? ''),
            'upgradeMin' => (int)($row['upgrade_min'] ?? -1),
            'upgradeMax' => (int)($row['upgrade_max'] ?? -1),
            'desiredBuyPrice' => (string)($row['desired_buy_price'] ?? ''),
        ];
    }
    return $out;
}

function upsert_user_tracked_item_subscription(
    PDO $db,
    int $userId,
    string $itemId,
    string $kind,
    string $quality,
    int $upgradeMin,
    int $upgradeMax,
    string $desiredBuyPrice,
): void {
    $normItem = trim($itemId);
    if ($normItem === '') {
        throw new InvalidArgumentException('itemId required');
    }
    if (!user_has_tracked_item($db, $userId, $normItem)) {
        throw new InvalidArgumentException('Сначала добавьте предмет в «Мои отслеживания»');
    }
    $stmt = $db->prepare(
        'INSERT INTO auction_user_tracked_item_subscriptions
         (user_id, item_id, kind, quality, upgrade_min, upgrade_max, desired_buy_price, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE desired_buy_price = VALUES(desired_buy_price), updated_at = UTC_TIMESTAMP()',
    );
    $stmt->execute([$userId, $normItem, $kind, $quality, $upgradeMin, $upgradeMax, $desiredBuyPrice]);
}

function delete_user_tracked_item_subscription(
    PDO $db,
    int $userId,
    string $itemId,
    string $kind,
    string $quality,
    int $upgradeMin,
    int $upgradeMax,
): void {
    $stmt = $db->prepare(
        'DELETE FROM auction_user_tracked_item_subscriptions
         WHERE user_id = ? AND item_id = ? AND kind = ? AND quality = ? AND upgrade_min = ? AND upgrade_max = ?',
    );
    $stmt->execute([$userId, trim($itemId), $kind, $quality, $upgradeMin, $upgradeMax]);
}

function delete_all_subscriptions_for_user_item(PDO $db, int $userId, string $itemId): void
{
    $stmt = $db->prepare('DELETE FROM auction_user_tracked_item_subscriptions WHERE user_id = ? AND item_id = ?');
    $stmt->execute([$userId, trim($itemId)]);
}

function delete_all_subscriptions_for_item(PDO $db, string $itemId): void
{
    $stmt = $db->prepare('DELETE FROM auction_user_tracked_item_subscriptions WHERE item_id = ?');
    $stmt->execute([trim($itemId)]);
}
