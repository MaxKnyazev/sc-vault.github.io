import { ActionIcon, Alert, Box, Group, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { useAuctionPricesStore } from '../../shared/store/auctionPricesStore'
import { useAuthStore } from '../../shared/store/authStore'

type AuctionRefreshStatusProps = {
  itemIds: string[]
}

const AUTO_REFRESH_MS = 5 * 60 * 1000

function formatLastUpdatedLabel(iso: string | null, timezoneOffsetHours: number): string {
  if (!iso) return 'еще не обновлялись'
  const source = new Date(iso)
  if (Number.isNaN(source.getTime())) return 'еще не обновлялись'
  const shifted = new Date(source.getTime() + timezoneOffsetHours * 60 * 60 * 1000)
  return shifted.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  })
}

export function AuctionRefreshStatus({ itemIds }: AuctionRefreshStatusProps) {
  const refreshAll = useAuctionPricesStore((s) => s.refreshAll)
  const byItemId = useAuctionPricesStore((s) => s.byItemId)
  const isRefreshing = useAuctionPricesStore((s) => s.isRefreshing)
  const progress = useAuctionPricesStore((s) => s.progress)
  const error = useAuctionPricesStore((s) => s.error)
  const resetError = useAuctionPricesStore((s) => s.resetError)
  const timezoneOffsetHours = useAuthStore((s) => s.user?.timezoneOffsetHours ?? 0)
  const [isTextHovered, setIsTextHovered] = useState(false)

  const uniqueItemIds = useMemo(() => [...new Set(itemIds)].filter(Boolean), [itemIds])
  const lastUpdatedIso = useMemo(() => {
    let bestTs = 0
    let bestIso: string | null = null
    for (const id of uniqueItemIds) {
      const iso = byItemId[id]?.fetchedAt ?? null
      if (!iso) continue
      const ts = Date.parse(iso)
      if (!Number.isFinite(ts)) continue
      if (ts > bestTs) {
        bestTs = ts
        bestIso = iso
      }
    }
    return bestIso
  }, [byItemId, uniqueItemIds])
  const triggerRefresh = () => {
    if (uniqueItemIds.length > 0) void refreshAll(uniqueItemIds)
  }

  useEffect(() => {
    if (uniqueItemIds.length === 0) return
    if (!lastUpdatedIso && !isRefreshing) {
      void refreshAll(uniqueItemIds)
    }
  }, [isRefreshing, lastUpdatedIso, refreshAll, uniqueItemIds])

  useEffect(() => {
    if (uniqueItemIds.length === 0) return
    const timer = setInterval(() => {
      if (!useAuctionPricesStore.getState().isRefreshing) {
        void refreshAll(uniqueItemIds)
      }
    }, AUTO_REFRESH_MS)
    return () => clearInterval(timer)
  }, [refreshAll, uniqueItemIds])

  return (
    <Stack gap="xs">
      {error ? (
        <Alert color="red" title="Аукцион" withCloseButton onClose={resetError}>
          <Box
            style={{
              maxHeight: 240,
              overflowY: 'auto',
              wordBreak: 'break-word',
            }}
          >
            <Text size="sm" component="pre" style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
              {error}
            </Text>
          </Box>
        </Alert>
      ) : null}
      <Group gap="xs" align="center" wrap="wrap">
        <ActionIcon
          variant="light"
          color="blue"
          radius="sm"
          size={30}
          loading={isRefreshing}
          onClick={triggerRefresh}
          aria-label="Обновить цены аукциона"
          title="Обновить цены аукциона"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </ActionIcon>
        <Text
          size="xs"
          c={isTextHovered ? 'gray.3' : 'dimmed'}
          onClick={triggerRefresh}
          onMouseEnter={() => setIsTextHovered(true)}
          onMouseLeave={() => setIsTextHovered(false)}
          style={{ cursor: 'pointer', transition: 'color 120ms ease' }}
          title="Обновить цены аукциона"
        >
          Последнее обновление {formatLastUpdatedLabel(lastUpdatedIso, timezoneOffsetHours)}
        </Text>
        {progress ? (
          <Text size="xs" c="dimmed">
            · {progress.done}/{progress.total}
          </Text>
        ) : null}
      </Group>
    </Stack>
  )
}
