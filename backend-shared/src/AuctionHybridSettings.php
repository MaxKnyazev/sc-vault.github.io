<?php

declare(strict_types=1);

function auction_hybrid_default_settings_array(): array
{
    return [
        'mode' => 'last_sales',
        'minTrades' => 5,
        'lastSalesCount' => 100,
        'timeWindow' => '12h',
    ];
}

function normalize_auction_hybrid_settings_array(mixed $raw): array
{
    $def = auction_hybrid_default_settings_array();
    if (!is_array($raw)) {
        return $def;
    }
    $mode = (string)($raw['mode'] ?? $def['mode']);
    if ($mode !== 'last_sales' && $mode !== 'time_window') {
        $mode = $def['mode'];
    }
    $minTrades = (int)($raw['minTrades'] ?? $def['minTrades']);
    if ($minTrades < 1) {
        $minTrades = 1;
    }
    if ($minTrades > 200) {
        $minTrades = 200;
    }
    $allowedN = [50, 100, 200, 500, 1000];
    $lastSalesCount = (int)($raw['lastSalesCount'] ?? $def['lastSalesCount']);
    if (!in_array($lastSalesCount, $allowedN, true)) {
        $lastSalesCount = $def['lastSalesCount'];
    }
    $timeWindow = strtolower(trim((string)($raw['timeWindow'] ?? $def['timeWindow'])));
    $allowedW = ['1h', '6h', '12h', '24h'];
    if (!in_array($timeWindow, $allowedW, true)) {
        $timeWindow = $def['timeWindow'];
    }
    return [
        'mode' => $mode,
        'minTrades' => $minTrades,
        'lastSalesCount' => $lastSalesCount,
        'timeWindow' => $timeWindow,
    ];
}

function decode_auction_hybrid_settings_column(mixed $column): array
{
    if ($column === null || $column === '') {
        return auction_hybrid_default_settings_array();
    }
    if (is_string($column)) {
        $decoded = json_decode($column, true);
        return normalize_auction_hybrid_settings_array(is_array($decoded) ? $decoded : []);
    }
    if (is_array($column)) {
        return normalize_auction_hybrid_settings_array($column);
    }
    return auction_hybrid_default_settings_array();
}
