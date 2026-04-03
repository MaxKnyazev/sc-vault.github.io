import { Text } from '@mantine/core'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'
import { useAuctionPricesStore } from '../../shared/store/auctionPricesStore'

type AuctionPrice24hLineProps = {
  itemId: string
  size?: 'xs' | 'sm'
}

export function AuctionPrice24hLine({ itemId, size = 'xs' }: AuctionPrice24hLineProps) {
  const stat = useAuctionPricesStore((s) => s.byItemId[itemId])

  if (!stat) {
    return (
      <Text size={size} c="dimmed" lh={1.35}>
        Выкупы 12ч: нет кэша — нажмите «Обновить цены аукциона»
      </Text>
    )
  }

  if (stat.tradeCount === 0 || stat.avgPerUnit === null) {
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
