import { Text } from '@mantine/core'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'
import { useAuctionPricesStore } from '../../shared/store/auctionPricesStore'
import { useAuctionBlacklistStore } from '../../shared/store/auctionBlacklistStore'

type AuctionPrice24hLineProps = {
  itemId: string
  size?: 'xs' | 'sm'
  showNoCacheHint?: boolean
  hideWhenNoData?: boolean
}

export function AuctionPrice24hLine({
  itemId,
  size = 'xs',
  showNoCacheHint = true,
  hideWhenNoData = false,
}: AuctionPrice24hLineProps) {
  const stat = useAuctionPricesStore((s) => s.byItemId[itemId])
  const isBlacklisted = useAuctionBlacklistStore((s) => s.blacklist.has(itemId))

  if (isBlacklisted) {
    return (
      <Text size={size} c="dimmed" lh={1.35}>
        Не отслеживается на аукционе
      </Text>
    )
  }

  if (!stat) {
    if (hideWhenNoData) return null
    return (
      <Text size={size} c="dimmed" lh={1.35}>
        {showNoCacheHint ? 'Выкупы 12ч: нет кэша — нажмите «Обновить цены аукциона»' : 'Выкупы 12ч: нет данных'}
      </Text>
    )
  }

  if (stat.tradeCount === 0 || stat.avgPerUnit === null) {
    if (hideWhenNoData) return null
    return (
      <Text size={size} c="dimmed" lh={1.35}>
        Выкупы 12ч: нет сделок
      </Text>
    )
  }

  return (
    <Text size={size} c="dimmed" lh={1.35}>
      Выкупы 12ч: {formatAuctionRub(stat.avgPerUnit)} ₽/шт · лотов {stat.tradeCount} · шт{' '}
      {stat.totalQty}
    </Text>
  )
}
