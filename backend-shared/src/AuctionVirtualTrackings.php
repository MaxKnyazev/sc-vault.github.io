<?php

declare(strict_types=1);

function normalize_virtual_kind(string $raw): string
{
    $k = strtolower(trim($raw));
    if (!in_array($k, ['core', 'artifact'], true)) {
        throw new InvalidArgumentException('Unsupported kind: ' . $raw);
    }
    return $k;
}

function normalize_virtual_quality(string $raw, string $kind): string
{
    $q = strtolower(trim($raw));
    $allowedCore = ['normal', 'uncommon', 'special', 'rare', 'exclusive', 'legendary'];
    $allowedArtifact = ['normal', 'uncommon', 'special', 'rare', 'exclusive', 'legendary', 'unique'];
    $allowed = $kind === 'artifact' ? $allowedArtifact : $allowedCore;
    if (!in_array($q, $allowed, true)) {
        throw new InvalidArgumentException('Unsupported quality: ' . $raw);
    }
    return $q;
}

function normalize_virtual_upgrade_range($minRaw, $maxRaw, string $kind): array
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

function normalize_virtual_desired_price(string $raw): string
{
    $digits = preg_replace('/\D+/', '', $raw) ?? '';
    if ($digits === '') {
        throw new InvalidArgumentException('desiredBuyPrice required');
    }
    if (strlen($digits) > 32) {
        throw new InvalidArgumentException('Слишком длинное значение цены');
    }
    return $digits;
}

/**
 * @return array<int, array{kind: string, quality: string, upgradeMin: int, upgradeMax: int, desiredBuyPrice: string}>
 */
function get_user_virtual_trackings(PDO $db, int $userId): array
{
    $stmt = $db->prepare(
        'SELECT kind, quality, upgrade_min, upgrade_max, desired_buy_price
         FROM auction_user_virtual_trackings
         WHERE user_id = ?
         ORDER BY kind ASC, quality ASC, upgrade_min ASC, upgrade_max ASC',
    );
    $stmt->execute([$userId]);
    $out = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $out[] = [
            'kind' => (string)($row['kind'] ?? ''),
            'quality' => (string)($row['quality'] ?? ''),
            'upgradeMin' => (int)($row['upgrade_min'] ?? -1),
            'upgradeMax' => (int)($row['upgrade_max'] ?? -1),
            'desiredBuyPrice' => (string)($row['desired_buy_price'] ?? ''),
        ];
    }
    return $out;
}

function upsert_user_virtual_tracking(
    PDO $db,
    int $userId,
    string $kind,
    string $quality,
    int $upgradeMin,
    int $upgradeMax,
    string $desiredBuyPrice,
): void {
    $stmt = $db->prepare(
        'INSERT INTO auction_user_virtual_trackings (user_id, kind, quality, upgrade_min, upgrade_max, desired_buy_price, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE desired_buy_price = VALUES(desired_buy_price), updated_at = UTC_TIMESTAMP()',
    );
    $stmt->execute([$userId, $kind, $quality, $upgradeMin, $upgradeMax, $desiredBuyPrice]);
}

function delete_user_virtual_tracking(PDO $db, int $userId, string $kind, string $quality, int $upgradeMin, int $upgradeMax): void
{
    $stmt = $db->prepare(
        'DELETE FROM auction_user_virtual_trackings
         WHERE user_id = ? AND kind = ? AND quality = ? AND upgrade_min = ? AND upgrade_max = ?',
    );
    $stmt->execute([$userId, $kind, $quality, $upgradeMin, $upgradeMax]);
}

/**
 * @return array<string, array{minPrice: int, itemId: string, updatedAt: string}>
 */
function get_virtual_active_lot_mins(PDO $db): array
{
    $stmt = $db->query(
        'SELECT kind, quality, upgrade, min_price, item_id, updated_at
         FROM auction_virtual_active_lot_mins',
    );
    $out = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $key = (string)($row['kind'] ?? '') . '|' . (string)($row['quality'] ?? '') . '|' . (string)($row['upgrade'] ?? '');
        $out[$key] = [
            'minPrice' => (int)($row['min_price'] ?? 0),
            'itemId' => (string)($row['item_id'] ?? ''),
            'updatedAt' => (string)($row['updated_at'] ?? ''),
        ];
    }
    return $out;
}

