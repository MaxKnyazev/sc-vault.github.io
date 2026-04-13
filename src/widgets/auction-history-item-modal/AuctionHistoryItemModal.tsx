import { ActionIcon, Alert, Box, Button, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { getQualityModalGlowBoxShadow } from '../../shared/lib/getQualityGlowColor'
import { useAuctionHistoryItemModalStore } from '../../shared/store/auctionHistoryItemModalStore'
import {
  fetchAuctionItemHistory,
  type AuctionHistoryPoint,
  type AuctionHistoryRange,
} from '../../shared/api/backendApi'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'

const RANGE_OPTIONS: AuctionHistoryRange[] = ['24h', '7d', '30d', '90d']

function buildPolylinePoints(values: number[], width: number, height: number, padding: number): string {
  if (values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map((value, idx) => {
      const x =
        values.length === 1
          ? width / 2
          : padding + (idx / (values.length - 1)) * (width - padding * 2)
      const y = height - padding - ((value - min) / span) * (height - padding * 2)
      return `${x},${y}`
    })
    .join(' ')
}

export function AuctionHistoryItemModal() {
  const { opened, itemId, close } = useAuctionHistoryItemModalStore()
  const { itemsById, realm } = useHideoutStore()
  const [range, setRange] = useState<AuctionHistoryRange>('7d')
  const [points, setPoints] = useState<AuctionHistoryPoint[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const item = itemId ? itemsById[itemId] : undefined
  const itemName = getItemName(item?.name?.lines)
  const iconUrl = item ? buildItemIconUrl(item.icon, realm) : undefined
  const qualityForGlow = item?.color
  const modalGlow = useMemo(() => getQualityModalGlowBoxShadow(qualityForGlow), [qualityForGlow])
  const priceValues = useMemo(
    () => points.map((point) => point.avgPerUnit).filter((v): v is number => v !== null),
    [points],
  )
  const latestPrice = useMemo(() => {
    const last = [...points].reverse().find((point) => point.avgPerUnit !== null)
    return last?.avgPerUnit ?? null
  }, [points])
  const totalTrades = useMemo(
    () => points.reduce((sum, point) => sum + point.tradeCount, 0),
    [points],
  )
  const polyline = useMemo(
    () => buildPolylinePoints(priceValues, 640, 220, 20),
    [priceValues],
  )
  const minPrice = priceValues.length > 0 ? Math.min(...priceValues) : null
  const maxPrice = priceValues.length > 0 ? Math.max(...priceValues) : null

  useEffect(() => {
    if (!opened || !itemId) return
    void (async () => {
      setIsLoading(true)
      setError(null)
      try {
        const rows = await fetchAuctionItemHistory(itemId, range)
        setPoints(rows)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить историю')
        setPoints([])
      } finally {
        setIsLoading(false)
      }
    })()
  }, [opened, itemId, range])

  useEffect(() => {
    if (!opened) {
      setRange('7d')
      setPoints([])
      setError(null)
      setIsLoading(false)
    }
  }, [opened])

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={null}
      withCloseButton={false}
      centered
      size="lg"
      removeScrollProps={{
        removeScrollBar: false,
      }}
      styles={{
        content: {
          boxShadow: modalGlow,
          overflow: 'visible',
        },
      }}
    >
      <Stack gap="sm">
        {itemId ? (
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Box style={{ flex: 1, minWidth: 0 }}>
              <ItemBadge
                name={itemName || itemId}
                iconUrl={iconUrl}
                qualityColor={item?.color}
                size="result"
                showFavoriteButton={false}
              />
            </Box>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              onClick={close}
              aria-label="Закрыть"
              style={{ marginTop: 2, marginLeft: 4 }}
            >
              ✕
            </ActionIcon>
          </Group>
        ) : null}
        <Group gap="xs" wrap="wrap">
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={option}
              size="xs"
              variant={range === option ? 'filled' : 'default'}
              onClick={() => setRange(option)}
            >
              {option}
            </Button>
          ))}
        </Group>

        {error ? <Alert color="red">{error}</Alert> : null}
        {isLoading ? <Loader size="sm" /> : null}

        {!isLoading && !error ? (
          <>
            <Text size="sm" c="dimmed">
              {latestPrice !== null ? `Текущая средняя цена: ${formatAuctionRub(latestPrice)} ₽` : 'Нет данных по цене'}
              {` · Лотов: ${totalTrades}`}
            </Text>
            {priceValues.length >= 2 ? (
              <Box
                p="xs"
                bd="1px solid var(--mantine-color-default-border)"
                style={{ borderRadius: 8 }}
              >
                <svg width="100%" viewBox="0 0 640 220" preserveAspectRatio="none" style={{ display: 'block' }}>
                  <polyline
                    points={polyline}
                    fill="none"
                    stroke="var(--mantine-color-blue-5)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">
                    min: {minPrice !== null ? `${formatAuctionRub(minPrice)} ₽` : '-'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    max: {maxPrice !== null ? `${formatAuctionRub(maxPrice)} ₽` : '-'}
                  </Text>
                </Group>
              </Box>
            ) : (
              <Text size="sm" c="dimmed">
                Недостаточно точек для графика.
              </Text>
            )}
          </>
        ) : null}
      </Stack>
    </Modal>
  )
}

