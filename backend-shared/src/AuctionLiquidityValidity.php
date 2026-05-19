<?php

declare(strict_types=1);

require_once __DIR__ . '/Auction.php';
require_once __DIR__ . '/AuctionTrackedItems.php';

/** @return array{ratioBelowAverage:float,ratioBelowAverageUpper:float,ratioBelowReliable:float} */
function auction_liquidity_tier_ratio_thresholds(): array
{
    return [
        'ratioBelowAverage' => 0.5,
        'ratioBelowAverageUpper' => 1.5,
        'ratioBelowReliable' => 2.5,
    ];
}

/**
 * @param list<int|float> $values
 */
function auction_liquidity_median(array $values): float
{
    $nums = [];
    foreach ($values as $v) {
        if (is_int($v) || is_float($v)) {
            $nums[] = (float)$v;
        }
    }
    $n = count($nums);
    if ($n === 0) {
        return 0.0;
    }
    sort($nums, SORT_NUMERIC);
    $mid = intdiv($n, 2);
    if ($n % 2 === 1) {
        return $nums[$mid];
    }
    return ($nums[$mid - 1] + $nums[$mid]) / 2.0;
}

/**
 * @return array{window:string,medianTradeCount:float,trackedCount:int,activeCount:int}
 */
function compute_tracked_liquidity_benchmark(PDO $db, string $window): array
{
    $windowName = normalize_window_name($window);
    $trackedIds = get_global_tracked_auction_item_ids($db);
    $trackedCount = count($trackedIds);
    if ($trackedCount === 0) {
        return [
            'window' => $windowName,
            'medianTradeCount' => 0.0,
            'trackedCount' => 0,
            'activeCount' => 0,
        ];
    }

    ensure_auction_stats_for_items($db, $trackedIds, $windowName);
    $stats = get_auction_stats($db, $trackedIds, $windowName);
    $positive = [];
    foreach ($trackedIds as $itemId) {
        $row = $stats[$itemId] ?? null;
        $cnt = $row ? (int)$row['tradeCount'] : 0;
        if ($cnt > 0) {
            $positive[] = $cnt;
        }
    }

    return [
        'window' => $windowName,
        'medianTradeCount' => auction_liquidity_median($positive),
        'trackedCount' => $trackedCount,
        'activeCount' => count($positive),
    ];
}

/**
 * @param array{medianTradeCount:float} $benchmark
 * @return array{tier:string,ratioToMedian:float|null}
 */
function liquidity_tier_for_trade_count(int $tradeCount, bool $isTracked, array $benchmark): array
{
    if (!$isTracked || $tradeCount <= 0) {
        return ['tier' => 'invalid', 'ratioToMedian' => null];
    }

    $median = (float)($benchmark['medianTradeCount'] ?? 0.0);
    if ($median <= 0.0) {
        return ['tier' => 'reliable', 'ratioToMedian' => null];
    }

    $ratio = $tradeCount / $median;
    $t = auction_liquidity_tier_ratio_thresholds();
    $tier = 'reliable';
    if ($ratio < $t['ratioBelowAverage']) {
        $tier = 'below_average';
    } elseif ($ratio < $t['ratioBelowAverageUpper']) {
        $tier = 'average';
    } elseif ($ratio < $t['ratioBelowReliable']) {
        $tier = 'above_average';
    }

    return ['tier' => $tier, 'ratioToMedian' => round($ratio, 3)];
}

/**
 * @return array{
 *   fetchedAt:string,
 *   benchmark:array,
 *   items:array<string, array{tier:string,tradeCount:int,ratioToMedian:float|null,isTracked:bool}>
 * }
 */
function get_auction_liquidity_validity_bulk(PDO $db, array $itemIds, string $window): array
{
    $windowName = normalize_window_name($window);
    $benchmark = compute_tracked_liquidity_benchmark($db, $windowName);

    $normalized = [];
    foreach ($itemIds as $itemId) {
        $id = trim((string)$itemId);
        if ($id !== '') {
            $normalized[$id] = true;
        }
    }
    $ids = array_keys($normalized);

    if (count($ids) > 0) {
        ensure_auction_stats_for_items($db, $ids, $windowName);
    }
    $stats = count($ids) > 0 ? get_auction_stats($db, $ids, $windowName) : [];

    $items = [];
    foreach ($ids as $itemId) {
        $isTracked = global_has_tracked_item($db, $itemId);
        $row = $stats[$itemId] ?? null;
        $tradeCount = $row ? (int)$row['tradeCount'] : 0;
        $tierInfo = liquidity_tier_for_trade_count($tradeCount, $isTracked, $benchmark);
        $items[$itemId] = [
            'tier' => $tierInfo['tier'],
            'tradeCount' => $tradeCount,
            'ratioToMedian' => $tierInfo['ratioToMedian'],
            'isTracked' => $isTracked,
        ];
    }

    return [
        'fetchedAt' => gmdate('c'),
        'benchmark' => $benchmark,
        'items' => $items,
    ];
}
