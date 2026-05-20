import {
  AUCTION_LIQUIDITY_LABELS,
  type AuctionLiquidityTier,
} from '../constants/auctionLiquidityValidity'

export function auctionLiquidityShortLabel(tier: AuctionLiquidityTier): string {
  return AUCTION_LIQUIDITY_LABELS[tier].short
}

export function auctionLiquidityBadgeLabel(tier: AuctionLiquidityTier): string {
  return AUCTION_LIQUIDITY_LABELS[tier].badge
}

export function auctionLiquidityTooltip(
  tier: AuctionLiquidityTier,
  tradeCount: number,
  medianTradeCount: number | null,
  window: string,
  ratioToMedian: number | null,
  isTracked?: boolean,
): string {
  const base = AUCTION_LIQUIDITY_LABELS[tier].tooltip
  const parts = [base, `Лотов за ${window}: ${tradeCount}`]
  if (isTracked === false) {
    parts.push('Предмет не в глобальном отслеживании cron')
  }
  if (medianTradeCount !== null && medianTradeCount > 0) {
    parts.push(`Медиана по отслеживаемым: ${medianTradeCount}`)
  }
  if (ratioToMedian !== null) {
    parts.push(`Отношение к медиане: ${ratioToMedian.toFixed(2)}`)
  }
  return parts.join(' · ')
}
