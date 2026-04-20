import { ActionIcon, Group, Text } from '@mantine/core'
import { useState } from 'react'
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
  const [isHovered, setIsHovered] = useState(false)
  const openByTextOrIcon = (event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.()
    openHistoryModal(itemId)
  }

  const line = (content: string) => (
    <Group
      gap={6}
      wrap="nowrap"
      align="center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <ActionIcon
        size={26}
        radius="md"
        variant={isHovered ? 'filled' : 'light'}
        color="blue"
        aria-label="Открыть историю аукциона"
        title="Открыть историю аукциона"
        onClick={openByTextOrIcon}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
      <Text
        size={size}
        c={isHovered ? 'gray.3' : 'dimmed'}
        lh={1.35}
        onClick={openByTextOrIcon}
        style={{ cursor: 'pointer', transition: 'color 120ms ease' }}
        title="Открыть историю аукциона"
      >
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
