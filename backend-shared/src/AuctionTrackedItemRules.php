<?php

declare(strict_types=1);

/**
 * Правила подписок пользователя на конкретный itemId:
 * - quality: одна из normal/uncommon/special/rare/exclusive/legendary/unique/unknown (как в UI)
 * - upgrade: 0..15 для артефактов; NULL для правил, где заточка не применяется (ядра модулей).
 *
 * Хранение нормализовано: 1 строка = 1 комбинация (quality, upgrade).
 * Это позволяет безболезненно подписываться сразу на несколько редкостей/заточек.
 */

function normalize_tracked_rule_quality(string $raw): string
{
    $q = strtolower(trim($raw));
    $allowed = [
        'normal',
        'uncommon',
        'special',
        'rare',
        'exclusive',
        'legendary',
        'unique',
        'unknown',
    ];
    if (!in_array($q, $allowed, true)) {
        throw new InvalidArgumentException('Unsupported quality: ' . $raw);
    }
    return $q;
}

function normalize_tracked_rule_upgrade($raw): ?int
{
    if ($raw === null || $raw === '') {
        return null;
    }
    if (!is_int($raw) && !is_string($raw)) {
        throw new InvalidArgumentException('Invalid upgrade');
    }
    $n = (int)$raw;
    if ($n < 0 || $n > 15) {
        throw new InvalidArgumentException('upgrade must be in range 0..15');
    }
    return $n;
}

/**
 * @return array<string, array{qualities: string[], upgrades: int[]}>
 */
function get_user_tracked_item_rules(PDO $db, int $userId): array
{
    $stmt = $db->prepare(
        'SELECT item_id, quality, upgrade
         FROM auction_user_tracked_item_rules
         WHERE user_id = ?
         ORDER BY item_id ASC, quality ASC, upgrade ASC',
    );
    $stmt->execute([$userId]);

    $out = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $itemId = (string)($row['item_id'] ?? '');
        if ($itemId === '') {
            continue;
        }
        $quality = (string)($row['quality'] ?? '');
        $upgrade = $row['upgrade'];
        $upgradeInt = $upgrade === null ? null : (int)$upgrade;

        if (!isset($out[$itemId])) {
            $out[$itemId] = ['qualities' => [], 'upgrades' => []];
        }
        if ($quality !== '' && !in_array($quality, $out[$itemId]['qualities'], true)) {
            $out[$itemId]['qualities'][] = $quality;
        }
        if ($upgradeInt !== null && !in_array($upgradeInt, $out[$itemId]['upgrades'], true)) {
            $out[$itemId]['upgrades'][] = $upgradeInt;
        }
    }

    foreach ($out as $itemId => $rule) {
        sort($out[$itemId]['qualities']);
        sort($out[$itemId]['upgrades']);
    }
    return $out;
}

/**
 * Перезаписывает набор правил пользователя для itemId.
 *
 * @param string[] $qualities
 * @param array<int|null> $upgrades
 */
function replace_user_tracked_item_rules(PDO $db, int $userId, string $itemId, array $qualities, array $upgrades): void
{
    $normItem = trim($itemId);
    if ($normItem === '') {
        throw new InvalidArgumentException('itemId required');
    }

    // Нормализуем вход
    $qNorm = [];
    foreach ($qualities as $q) {
        if (!is_string($q)) {
            continue;
        }
        $qNorm[] = normalize_tracked_rule_quality($q);
    }
    $qNorm = array_values(array_unique($qNorm));

    $uNorm = [];
    foreach ($upgrades as $u) {
        $uNorm[] = normalize_tracked_rule_upgrade($u);
    }
    // NULL оставляем (для ядер/правил без заточки); при наличии чисел — unique/sort
    $hasNull = in_array(null, $uNorm, true);
    $uNums = array_values(array_unique(array_values(array_filter($uNorm, static fn ($v) => $v !== null))));
    sort($uNums);

    // Если qualities пустой — очищаем правила для itemId
    $stmt = $db->prepare('DELETE FROM auction_user_tracked_item_rules WHERE user_id = ? AND item_id = ?');
    $stmt->execute([$userId, $normItem]);

    if (count($qNorm) === 0) {
        return;
    }

    // Для артефактов: если передали upgrades (0..15) — создаём комбинации (q, upgrade).
    // Для ядер: если upgrades пустой или есть null — создаём строки (q, NULL).
    $rows = [];
    if (count($uNums) > 0) {
        foreach ($qNorm as $q) {
            foreach ($uNums as $u) {
                $rows[] = [$userId, $normItem, $q, $u];
            }
        }
    } else {
        // Если клиент прислал null в upgrades, это означает «без заточки» (ядра).
        if (!$hasNull) {
            $hasNull = true;
        }
        if ($hasNull) {
            foreach ($qNorm as $q) {
                $rows[] = [$userId, $normItem, $q, null];
            }
        }
    }

    $ins = $db->prepare(
        'INSERT INTO auction_user_tracked_item_rules (user_id, item_id, quality, upgrade, created_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE created_at = created_at',
    );
    foreach ($rows as $r) {
        $ins->execute($r);
    }
}

