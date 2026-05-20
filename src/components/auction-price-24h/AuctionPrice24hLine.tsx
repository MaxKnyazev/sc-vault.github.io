import { ActionIcon, Box, Group, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { AuctionLiquidityBadge } from '../auction-liquidity-badge/AuctionLiquidityBadge'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'
import { useAuctionPricesStore } from '../../shared/store/auctionPricesStore'
import { useAuctionBlacklistStore } from '../../shared/store/auctionBlacklistStore'
import { useAuctionHistoryItemModalStore } from '../../shared/store/auctionHistoryItemModalStore'
import { getBackendApiBaseUrl } from '../../shared/config/backendApi'

const ICON_SIZE = 26
const LIQUIDITY_BADGE_SLOT_HEIGHT = 28

type AuctionPrice24hLineProps = {
  itemId: string
  size?: 'xs' | 'sm'
  showNoCacheHint?: boolean
  hideWhenNoData?: boolean
  /** В узких карточках ингредиентов бейдж ликвидности — под строкой «Выкупы» */
  layout?: 'inline' | 'stacked'
}

export function AuctionPrice24hLine({
  itemId,
  size = 'xs',
  showNoCacheHint = true,
  hideWhenNoData = false,
  layout = 'inline',
}: AuctionPrice24hLineProps) {
  const stat = useAuctionPricesStore((s) => s.byItemId[itemId])
  const isBlacklisted = useAuctionBlacklistStore((s) => s.blacklist.has(itemId))
  const openHistoryModal = useAuctionHistoryItemModalStore((s) => s.open)
  const [isHovered, setIsHovered] = useState(false)
  const openByTextOrIcon = (event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.()
    openHistoryModal(itemId)
  }

  const showLiquidityBadge = Boolean(getBackendApiBaseUrl())

  const historyIcon = (
    <ActionIcon
      size={ICON_SIZE}
      radius="md"
      variant={isHovered ? 'filled' : 'light'}
      color={isHovered ? 'blue' : 'gray'}
      aria-label="Открыть историю аукциона"
      title="Открыть историю аукциона"
      onClick={openByTextOrIcon}
      style={{
        flexShrink: 0,
        backgroundColor: isHovered ? undefined : 'rgba(255,255,255,0.10)',
        transition: 'background-color 140ms ease, color 140ms ease, transform 140ms ease',
      }}
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
  )

  const buyoutText = (content: string) => (
    <Text
      size={size}
      c={isHovered ? 'gray.3' : 'dimmed'}
      lh={1.35}
      onClick={openByTextOrIcon}
      style={{ cursor: 'pointer', transition: 'color 120ms ease', minWidth: 0 }}
      title="Открыть историю аукциона"
    >
      {content}
    </Text>
  )

  const liquidityBadge = showLiquidityBadge ? <AuctionLiquidityBadge itemId={itemId} /> : null

  const line = (content: string) => (
    <Group
      gap={6}
      wrap="nowrap"
      align={layout === 'stacked' ? 'flex-start' : 'center'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {historyIcon}
      {layout === 'stacked' ? (
        <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
          {buyoutText(content)}
          {liquidityBadge}
        </Stack>
      ) : (
        <>
          {buyoutText(content)}
          {liquidityBadge ? (
            <Box
              style={{
                display: 'flex',
                alignItems: 'center',
                alignSelf: 'center',
                height: LIQUIDITY_BADGE_SLOT_HEIGHT,
                flexShrink: 0,
              }}
            >
              {liquidityBadge}
            </Box>
          ) : null}
        </>
      )}
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
