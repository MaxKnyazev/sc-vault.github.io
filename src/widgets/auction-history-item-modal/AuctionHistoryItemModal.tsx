import { ActionIcon, Alert, Box, Button, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState, type MouseEvent, type WheelEvent } from 'react'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { getQualityModalGlowBoxShadow } from '../../shared/lib/getQualityGlowColor'
import { useAuctionHistoryItemModalStore } from '../../shared/store/auctionHistoryItemModalStore'
import { useAuthStore } from '../../shared/store/authStore'
import {
  fetchAuctionItemHistory,
  type AuctionHistoryPoint,
  type AuctionHistoryQuality,
  type AuctionHistoryRange,
  type AuctionHistoryUpgrade,
  type AuctionHistoryZoom,
} from '../../shared/api/backendApi'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'

const RANGE_OPTIONS: AuctionHistoryRange[] = ['30m', '1h', '12h', '24h', '7d', '30d', '90d']
const QUALITY_OPTIONS: Array<{ value: AuctionHistoryQuality; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'normal', label: 'Обычный' },
  { value: 'uncommon', label: 'Необычный' },
  { value: 'special', label: 'Особый' },
  { value: 'rare', label: 'Редкий' },
  { value: 'exclusive', label: 'Исключительный' },
  { value: 'legendary', label: 'Легендарный' },
  { value: 'unique', label: 'Уникальный' },
  { value: 'unknown', label: 'Неизвестно' },
]
const ZOOM_LEVELS: AuctionHistoryZoom[] = [1, 2, 4]
const UPGRADE_OPTIONS: Array<{ value: AuctionHistoryUpgrade; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 1, label: '+1' },
  { value: 2, label: '+2' },
  { value: 3, label: '+3' },
  { value: 4, label: '+4' },
  { value: 5, label: '+5' },
  { value: 6, label: '+6' },
  { value: 7, label: '+7' },
  { value: 8, label: '+8' },
  { value: 9, label: '+9' },
  { value: 10, label: '+10' },
  { value: 11, label: '+11' },
  { value: 12, label: '+12' },
  { value: 13, label: '+13' },
  { value: 14, label: '+14' },
  { value: 15, label: '+15' },
]

const CHART_VB = { w: 640, h: 280 }
const CHART_MARGIN = { left: 48, right: 12, top: 14, bottom: 54 }

type ChartSeriesEntry = { point: AuctionHistoryPoint; x: number; y: number }

function buildChartSeries(points: AuctionHistoryPoint[]): {
  series: ChartSeriesEntry[]
  min: number
  max: number
} {
  const withPrice = points.filter((p): p is AuctionHistoryPoint & { avgPerUnit: number } => p.avgPerUnit !== null)
  if (withPrice.length === 0) return { series: [], min: 0, max: 0 }
  const values = withPrice.map((p) => p.avgPerUnit)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const plotW = CHART_VB.w - CHART_MARGIN.left - CHART_MARGIN.right
  const plotH = CHART_VB.h - CHART_MARGIN.top - CHART_MARGIN.bottom
  const n = withPrice.length
  const series = withPrice.map((point, idx) => {
    const x = n === 1 ? CHART_MARGIN.left + plotW / 2 : CHART_MARGIN.left + (idx / (n - 1)) * plotW
    const y = CHART_MARGIN.top + plotH - ((point.avgPerUnit - min) / span) * plotH
    return { point, x, y }
  })
  return { series, min, max }
}

function pickXTickIndices(count: number, maxTicks: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [0]
  const ticks = Math.min(maxTicks, count)
  const out: number[] = []
  for (let k = 0; k < ticks; k += 1) {
    out.push(Math.round((k / (ticks - 1)) * (count - 1)))
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

function pickYTickValues(min: number, max: number, tickCount: number): number[] {
  if (tickCount <= 1) return [min]
  const span = max - min
  if (span <= 0) return [min]
  const values: number[] = []
  for (let i = 0; i < tickCount; i += 1) {
    values.push(min + (i / (tickCount - 1)) * span)
  }
  return values
}

function parseUtcDate(ts: string): Date | null {
  const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z'
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function applyTimezoneOffset(date: Date, timezoneOffsetHours: number): Date {
  return new Date(date.getTime() + timezoneOffsetHours * 60 * 60 * 1000)
}

function formatHistoryAxisLabel(ts: string, range: AuctionHistoryRange, timezoneOffsetHours: number): string {
  const utcDate = parseUtcDate(ts)
  if (!utcDate) return ts
  const d = applyTimezoneOffset(utcDate, timezoneOffsetHours)
  if (range === '30m' || range === '1h' || range === '12h') {
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }
  if (range === '24h' || range === '7d') {
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    })
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function formatHistoryTooltipTime(ts: string, timezoneOffsetHours: number): string {
  const utcDate = parseUtcDate(ts)
  if (!utcDate) return ts
  const d = applyTimezoneOffset(utcDate, timezoneOffsetHours)
  return d.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
}

export function AuctionHistoryItemModal() {
  const { opened, itemId, close } = useAuctionHistoryItemModalStore()
  const { itemsById, realm } = useHideoutStore()
  const timezoneOffsetHours = useAuthStore((s) => s.user?.timezoneOffsetHours ?? 0)
  const [range, setRange] = useState<AuctionHistoryRange>('7d')
  const [quality, setQuality] = useState<AuctionHistoryQuality>('all')
  const [upgrade, setUpgrade] = useState<AuctionHistoryUpgrade>('all')
  const [points, setPoints] = useState<AuctionHistoryPoint[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState<AuctionHistoryZoom>(1)
  const item = itemId ? itemsById[itemId] : undefined
  const itemName = getItemName(item?.name?.lines)
  const iconUrl = item ? buildItemIconUrl(item.icon, realm) : undefined
  const qualityForGlow = item?.color
  const modalGlow = useMemo(() => getQualityModalGlowBoxShadow(qualityForGlow), [qualityForGlow])
  const latestPrice = useMemo(() => {
    const last = [...points].reverse().find((point) => point.avgPerUnit !== null)
    return last?.avgPerUnit ?? null
  }, [points])
  const totalTrades = useMemo(
    () => points.reduce((sum, point) => sum + point.tradeCount, 0),
    [points],
  )
  const visiblePoints = useMemo(
    () => points.filter((p): p is AuctionHistoryPoint & { avgPerUnit: number } => p.avgPerUnit !== null),
    [points],
  )
  const { series, min: minPrice, max: maxPrice } = useMemo(() => buildChartSeries(visiblePoints), [visiblePoints])
  const polyline = useMemo(
    () => (series.length === 0 ? '' : series.map((s) => `${s.x},${s.y}`).join(' ')),
    [series],
  )
  const xTickTarget = useMemo(() => Math.max(6, Math.min(20, Math.round(6 + (zoom - 1) * 1.6))), [zoom])
  const xTickIndices = useMemo(() => pickXTickIndices(series.length, xTickTarget), [series.length, xTickTarget])
  const yTickTarget = useMemo(() => Math.max(3, Math.min(7, Math.round(3 + (zoom - 1) * 0.35))), [zoom])
  const yTicks = useMemo(() => pickYTickValues(minPrice, maxPrice, yTickTarget), [minPrice, maxPrice, yTickTarget])
  const [chartHover, setChartHover] = useState<null | { x: number; y: number; point: AuctionHistoryPoint }>(null)

  const handleSvgWheel = (e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const direction = e.deltaY < 0 ? 1 : -1
    const idx = ZOOM_LEVELS.indexOf(zoom)
    const nextIdx = direction > 0 ? Math.min(ZOOM_LEVELS.length - 1, idx + 1) : Math.max(0, idx - 1)
    setZoom(ZOOM_LEVELS[nextIdx] ?? 1)
  }

  const handleSvgMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (series.length === 0) return
    const svg = e.currentTarget
    const r = svg.getBoundingClientRect()
    const vbX = ((e.clientX - r.left) / r.width) * CHART_VB.w
    let best: ChartSeriesEntry | null = null
    let bestDist = Infinity
    for (const s of series) {
      const d = Math.abs(s.x - vbX)
      if (d < bestDist) {
        bestDist = d
        best = s
      }
    }
    const slot = series.length > 1 ? (CHART_VB.w - CHART_MARGIN.left - CHART_MARGIN.right) / (series.length - 1) : CHART_VB.w
    const threshold = Math.max(32, slot * 0.55)
    if (best && bestDist <= threshold) {
      setChartHover({ x: best.x, y: best.y, point: best.point })
    } else {
      setChartHover(null)
    }
  }

  const plotH = CHART_VB.h - CHART_MARGIN.top - CHART_MARGIN.bottom
  const plotW = CHART_VB.w - CHART_MARGIN.left - CHART_MARGIN.right
  const midPrice = series.length > 0 ? (minPrice + maxPrice) / 2 : 0

  useEffect(() => {
    if (!opened || !itemId) return
    void (async () => {
      setIsLoading(true)
      setError(null)
      try {
        const rows = await fetchAuctionItemHistory(itemId, range, quality, zoom, upgrade)
        setPoints(rows)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить историю')
        setPoints([])
      } finally {
        setIsLoading(false)
      }
    })()
  }, [opened, itemId, range, quality, zoom, upgrade])

  useEffect(() => {
    setChartHover(null)
  }, [points, zoom, quality, range, upgrade])

  useEffect(() => {
    setZoom(1)
  }, [range, quality, upgrade, itemId])

  useEffect(() => {
    if (!opened) {
      setRange('7d')
      setQuality('all')
      setUpgrade('all')
      setPoints([])
      setError(null)
      setIsLoading(false)
      setZoom(1)
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
        <Group gap="xs" wrap="wrap">
          {QUALITY_OPTIONS.map((option) => (
            <Button
              key={option.value}
              size="xs"
              variant={quality === option.value ? 'filled' : 'default'}
              onClick={() => setQuality(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </Group>
        <Group gap="xs" wrap="wrap">
          {UPGRADE_OPTIONS.map((option) => (
            <Button
              key={`upgrade-${String(option.value)}`}
              size="xs"
              variant={upgrade === option.value ? 'filled' : 'default'}
              onClick={() => setUpgrade(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </Group>

        {error ? <Alert color="red">{error}</Alert> : null}

        <Text size="sm" c="dimmed">
          {latestPrice !== null ? `Текущая средняя цена: ${formatAuctionRub(latestPrice)} ₽` : 'Нет данных по цене'}
          {` · Лотов: ${totalTrades} · ZOOM x${zoom}`}
        </Text>

        <Box
          pos="relative"
          style={{
            minHeight: 350,
            display: 'flex',
            alignItems: 'stretch',
          }}
        >
          {series.length >= 1 ? (
            <Box
              pos="relative"
              p="xs"
              bd="1px solid var(--mantine-color-default-border)"
              style={{ borderRadius: 8, width: '100%' }}
            >
                <svg
                  width="100%"
                  viewBox={`0 0 ${CHART_VB.w} ${CHART_VB.h}`}
                  preserveAspectRatio="none"
                  style={{ display: 'block', color: 'var(--mantine-color-dimmed)' }}
                  onWheel={handleSvgWheel}
                  onMouseMove={handleSvgMouseMove}
                  onMouseLeave={() => setChartHover(null)}
                >
                  <text x={4} y={CHART_MARGIN.top + 11} fontSize={11} fill="currentColor" textAnchor="start">
                    {formatAuctionRub(maxPrice)} ₽
                  </text>
                  <text
                    x={4}
                    y={CHART_MARGIN.top + plotH / 2 + 4}
                    fontSize={11}
                    fill="currentColor"
                    textAnchor="start"
                  >
                    {formatAuctionRub(midPrice)} ₽
                  </text>
                  <text
                    x={4}
                    y={CHART_MARGIN.top + plotH + 2}
                    fontSize={11}
                    fill="currentColor"
                    textAnchor="start"
                  >
                    {formatAuctionRub(minPrice)} ₽
                  </text>
                  <line
                    x1={CHART_MARGIN.left}
                    y1={CHART_MARGIN.top + plotH}
                    x2={CHART_MARGIN.left + plotW}
                    y2={CHART_MARGIN.top + plotH}
                    stroke="currentColor"
                    strokeOpacity={0.35}
                    strokeWidth={1}
                  />
                  {yTicks.map((value, idx) => {
                    const y =
                      maxPrice === minPrice
                        ? CHART_MARGIN.top + plotH / 2
                        : CHART_MARGIN.top + plotH - ((value - minPrice) / (maxPrice - minPrice)) * plotH
                    return (
                      <line
                        key={`y-grid-${idx}`}
                        x1={CHART_MARGIN.left}
                        y1={y}
                        x2={CHART_MARGIN.left + plotW}
                        y2={y}
                        stroke="currentColor"
                        strokeOpacity={idx === 0 || idx === yTicks.length - 1 ? 0.12 : 0.2}
                        strokeDasharray="3 4"
                        strokeWidth={1}
                      />
                    )
                  })}
                  {xTickIndices.map((idx) => {
                    const s = series[idx]
                    return (
                      <line
                        key={`x-grid-${s.point.ts}-${idx}`}
                        x1={s.x}
                        y1={CHART_MARGIN.top}
                        x2={s.x}
                        y2={CHART_MARGIN.top + plotH}
                        stroke="currentColor"
                        strokeOpacity={0.15}
                        strokeDasharray="3 4"
                        strokeWidth={1}
                      />
                    )
                  })}
                  {polyline ? (
                    <polyline
                      points={polyline}
                      fill="none"
                      stroke="var(--mantine-color-blue-5)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {xTickIndices.map((idx) => {
                    const s = series[idx]
                    return (
                      <text
                        key={`${s.point.ts}-${idx}`}
                        x={s.x}
                        y={CHART_MARGIN.top + plotH + 36}
                        fontSize={10}
                        textAnchor="middle"
                        fill="currentColor"
                      >
                        {formatHistoryAxisLabel(s.point.ts, range, timezoneOffsetHours)}
                      </text>
                    )
                  })}
                  {series.map((s, i) => {
                    const hovered = chartHover?.point === s.point
                    return (
                      <circle
                        key={`${s.point.ts}-${i}`}
                        cx={s.x}
                        cy={s.y}
                        r={hovered ? 6 : 4}
                        fill="var(--mantine-color-blue-5)"
                        stroke="var(--mantine-color-body)"
                        strokeWidth={1.5}
                        style={{ pointerEvents: 'none' }}
                      />
                    )
                  })}
                </svg>
                {chartHover ? (
                  <Box
                    style={{
                      position: 'absolute',
                      left: `${(chartHover.x / CHART_VB.w) * 100}%`,
                      top: `${(chartHover.y / CHART_VB.h) * 100}%`,
                      transform: 'translate(-50%, calc(-100% - 10px))',
                      zIndex: 5,
                      minWidth: 200,
                      maxWidth: 280,
                      pointerEvents: 'none',
                      backgroundColor: 'var(--mantine-color-body)',
                      border: '1px solid var(--mantine-color-default-border)',
                      borderRadius: 8,
                      padding: '8px 10px',
                      boxShadow: 'var(--mantine-shadow-md)',
                    }}
                  >
                    <Text size="xs" fw={600}>
                      {formatHistoryTooltipTime(chartHover.point.ts, timezoneOffsetHours)}
                    </Text>
                    <Text size="xs" mt={4}>
                      Средняя цена: {formatAuctionRub(chartHover.point.avgPerUnit!)} ₽
                    </Text>
                    <Text size="xs">Сделок: {chartHover.point.tradeCount}</Text>
                    <Text size="xs">
                      Объём:{' '}
                      {new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(chartHover.point.totalQty)}{' '}
                      шт.
                    </Text>
                    <Text size="xs">Выручка: {formatAuctionRub(chartHover.point.totalRevenue)} ₽</Text>
                  </Box>
                ) : null}
                <Group justify="space-between" mt={4}>
                  <Text size="xs" c="dimmed">
                    min: {formatAuctionRub(minPrice)} ₽
                  </Text>
                  <Text size="xs" c="dimmed">
                    max: {formatAuctionRub(maxPrice)} ₽
                  </Text>
                </Group>
            </Box>
          ) : (
            <Box
              p="xs"
              bd="1px solid var(--mantine-color-default-border)"
              style={{
                borderRadius: 8,
                width: '100%',
                minHeight: 330,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text size="sm" c="dimmed">
                Недостаточно точек для графика.
              </Text>
            </Box>
          )}
          {isLoading ? (
            <Box
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'color-mix(in srgb, var(--mantine-color-body) 75%, transparent)',
                borderRadius: 8,
                zIndex: 6,
              }}
            >
              <Loader size="sm" />
            </Box>
          ) : null}
        </Box>
      </Stack>
    </Modal>
  )
}

