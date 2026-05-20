import { Badge, Tooltip } from '@mantine/core'
import { useEffect } from 'react'
import {
  AUCTION_LIQUIDITY_BADGE_COLOR,
  type AuctionLiquidityTier,
} from '../../shared/constants/auctionLiquidityValidity'
import {
  auctionLiquidityBadgeLabel,
  auctionLiquidityTooltip,
} from '../../shared/lib/auctionLiquidityValidity'
import { useAuctionLiquidityStore } from '../../shared/store/auctionLiquidityStore'
import { getBackendApiBaseUrl } from '../../shared/config/backendApi'

const BADGE_LABEL_STYLE = {
  textTransform: 'none' as const,
  lineHeight: 1.25,
  whiteSpace: 'nowrap' as const,
  letterSpacing: 0,
}

type AuctionLiquidityBadgeProps = {
  itemId: string
  window?: string
  size?: 'xs' | 'sm'
}

export function AuctionLiquidityBadge({ itemId, window = '12h', size = 'xs' }: AuctionLiquidityBadgeProps) {
  const row = useAuctionLiquidityStore((s) => s.byItemId[itemId])
  const benchmark = useAuctionLiquidityStore((s) => s.benchmark)
  const ensureForItems = useAuctionLiquidityStore((s) => s.ensureForItems)

  useEffect(() => {
    if (!getBackendApiBaseUrl() || !itemId) return
    void ensureForItems([itemId], window)
  }, [itemId, window, ensureForItems])

  if (!getBackendApiBaseUrl() || !row) return null

  const tier = row.tier as AuctionLiquidityTier
  const label = auctionLiquidityTooltip(
    tier,
    row.tradeCount,
    benchmark?.medianTradeCount ?? null,
    benchmark?.window ?? window,
    row.ratioToMedian,
    row.isTracked,
  )

  return (
    <Tooltip label={label} multiline w={280} withArrow>
      <Badge
        size={size}
        variant="light"
        color={AUCTION_LIQUIDITY_BADGE_COLOR[tier]}
        radius="sm"
        styles={{ label: BADGE_LABEL_STYLE, root: { flexShrink: 0, overflow: 'visible' } }}
        style={{ cursor: 'help' }}
      >
        {auctionLiquidityBadgeLabel(tier)}
      </Badge>
    </Tooltip>
  )
}
