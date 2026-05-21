import { Badge, Tooltip } from '@mantine/core'
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

const BADGE_STYLES = {
  root: {
    flexShrink: 0,
    overflow: 'visible' as const,
    paddingInline: 10,
    minHeight: 24,
    height: 'auto',
  },
  label: {
    textTransform: 'none' as const,
    lineHeight: 1.3,
    whiteSpace: 'nowrap' as const,
    letterSpacing: 0,
    paddingTop: 2,
    paddingBottom: 2,
    fontSize: 11,
  },
}

type AuctionLiquidityBadgeProps = {
  itemId: string
  window?: string
}

export function AuctionLiquidityBadge({ itemId, window = '12h' }: AuctionLiquidityBadgeProps) {
  const row = useAuctionLiquidityStore((s) => s.byItemId[itemId])

  if (!getBackendApiBaseUrl() || !row) return null

  const tier = row.tier as AuctionLiquidityTier
  const label = auctionLiquidityTooltip(tier, row.tradeCount, window)

  return (
    <Tooltip
      label={label}
      multiline
      w={220}
      withArrow
      color="dark"
      position="top"
      transitionProps={{ transition: 'fade', duration: 120 }}
    >
      <Badge
        size="sm"
        variant="light"
        color={AUCTION_LIQUIDITY_BADGE_COLOR[tier]}
        radius="sm"
        styles={BADGE_STYLES}
        style={{ cursor: 'help' }}
      >
        {auctionLiquidityBadgeLabel(tier)}
      </Badge>
    </Tooltip>
  )
}
