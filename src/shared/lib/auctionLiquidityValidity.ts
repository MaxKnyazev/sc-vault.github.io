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

function formatLiquidityWindowLabel(window: string): string {
  if (window === '12h') return '12 ч'
  if (window === '24h') return '24 ч'
  if (window === '6h') return '6 ч'
  if (window === '1h') return '1 ч'
  return window
}

function formatLotsRu(count: number): string {
  const n = Math.abs(Math.trunc(count))
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} лот`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} лота`
  return `${n} лотов`
}

/** Краткая подсказка при наведении: уровень + объём сделок за окно. */
export function auctionLiquidityTooltip(tier: AuctionLiquidityTier, tradeCount: number, window: string): string {
  const title = AUCTION_LIQUIDITY_LABELS[tier].short
  const period = formatLiquidityWindowLabel(window)
  if (tier === 'invalid' || tradeCount <= 0) {
    return `${title}\nНет сделок за ${period}`
  }
  return `${title}\n${formatLotsRu(tradeCount)} за ${period}`
}
