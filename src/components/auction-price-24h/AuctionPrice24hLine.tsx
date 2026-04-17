import { ActionIcon, Group, Text } from '@mantine/core'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'
import { useAuctionPricesStore } from '../../shared/store/auctionPricesStore'
import { useAuctionBlacklistStore } from '../../shared/store/auctionBlacklistStore'
import { useAuctionHistoryItemModalStore } from '../../shared/store/auctionHistoryItemModalStore'

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
  const openHistoryModal = useAuctionHistoryItemModalStore((s) => s.open)

  const line = (content: string) => (
    <Group gap={6} wrap="nowrap" align="center">
      <ActionIcon
        size={18}
        variant="subtle"
        color="gray"
        aria-label="Открыть историю аукциона"
        title="Открыть историю аукциона"
        onClick={(event) => {
          event.stopPropagation()
          openHistoryModal(itemId)
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 17L9.5 11.5L13 15L20 8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M17 8H20V11"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </ActionIcon>
      <Text size={size} c="dimmed" lh={1.35}>
        {content}
      </Text>
    </Group>
  )

  if (isBlacklisted) {
    return (
      <Text size={size} c="dimmed" lh={1.35}>
        Не отслеживается на аукционе
      </Text>
    )
  }

  if (!stat) {
    if (hideWhenNoData) return null
    return line(
      showNoCacheHint ? 'Выкупы 12ч: нет кэша — нажмите «Обновить цены аукциона»' : 'Выкупы 12ч: нет данных',
    )
  }

  if (stat.tradeCount === 0 || stat.avgPerUnit === null) {
    if (hideWhenNoData) return null
    return line('Выкупы 12ч: нет сделок')
  }

  return line(`Выкупы 12ч: ${formatAuctionRub(stat.avgPerUnit)} ₽/шт · лотов ${stat.tradeCount} · шт ${stat.totalQty}`)
}
