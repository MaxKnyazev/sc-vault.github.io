<?php

function normalize_energy_buy_price_input(string $raw): string
{
    $s = trim(str_replace(',', '.', $raw));
    if ($s === '') {
        return '';
    }
    if (!preg_match('/^[0-9]+(?:\.[0-9]+)?$/', $s)) {
        throw new InvalidArgumentException('Некорректная цена энергии');
    }
    return $s;
}

function get_user_energy_buy_price(PDO $db, int $userId): string
{
    $stmt = $db->prepare('SELECT buy_price FROM user_energy_buy_prices WHERE user_id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    return $row ? (string)$row['buy_price'] : '';
}

function set_user_energy_buy_price(PDO $db, int $userId, string $normalizedValue): void
{
    if ($normalizedValue === '') {
        $stmt = $db->prepare('DELETE FROM user_energy_buy_prices WHERE user_id = ?');
        $stmt->execute([$userId]);
        return;
    }
    $stmt = $db->prepare(
        'INSERT INTO user_energy_buy_prices (user_id, buy_price, updated_at)
         VALUES (?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           buy_price = VALUES(buy_price),
           updated_at = UTC_TIMESTAMP()'
    );
    $stmt->execute([$userId, $normalizedValue]);
}
