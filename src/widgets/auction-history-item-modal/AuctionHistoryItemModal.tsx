import { ActionIcon, Alert, Box, Button, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState, type MouseEvent, type WheelEvent } from 'react'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { getQualityModalGlowBoxShadow } from '../../shared/lib/getQualityGlowColor'
import { useAuctionHistoryItemModalStore } from '../../shared/store/auctionHistoryItemModalStore'
import {
  fetchAuctionItemHistory,
  type AuctionHistoryPoint,
  type AuctionHistoryQuality,
  type AuctionHistoryRange,
} from '../../shared/api/backendApi'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'

const RANGE_OPTIONS: AuctionHistoryRange[] = ['24h', '7d', '30d', '90d']
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
const MIN_ZOOM = 1
const MAX_ZOOM = 12

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

function formatHistoryAxisLabel(ts: string, range: AuctionHistoryRange): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  if (range === '24h' || range === '7d') {
    return d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: '2-digit' })
}

function formatHistoryTooltipTime(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
}

export function AuctionHistoryItemModal() {
  const { opened, itemId, close } = useAuctionHistoryItemModalStore()
  const { itemsById, realm } = useHideoutStore()
  const [range, setRange] = useState<AuctionHistoryRange>('7d')
  const [quality, setQuality] = useState<AuctionHistoryQuality>('all')
  const [points, setPoints] = useState<AuctionHistoryPoint[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number>(1)
  const [zoomCenterRatio, setZoomCenterRatio] = useState<number>(1)
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
  const pointsWithPrice = useMemo(
    () => points.filter((p): p is AuctionHistoryPoint & { avgPerUnit: number } => p.avgPerUnit !== null),
    [points],
  )
  const zoomState = useMemo(() => {
    const total = pointsWithPrice.length
    if (total === 0) return { visible: [] as Array<AuctionHistoryPoint & { avgPerUnit: number }>, start: 0, end: 0 }
    const windowSize = Math.max(8, Math.ceil(total / zoom))
    const centerIndex = Math.round((total - 1) * zoomCenterRatio)
    const start = Math.max(0, Math.min(total - windowSize, centerIndex - Math.floor(windowSize / 2)))
    const end = Math.min(total, start + windowSize)
    const windowPoints = pointsWithPrice.slice(start, end)
    const maxRenderPoints = Math.min(total, Math.round(35 + zoom * 45))
    if (windowPoints.length <= maxRenderPoints) return { visible: windowPoints, start, end }
    const stride = Math.ceil(windowPoints.length / maxRenderPoints)
    const compact = windowPoints.filter((_, idx) => idx % stride === 0 || idx === windowPoints.length - 1)
    return { visible: compact, start, end }
  }, [pointsWithPrice, zoom, zoomCenterRatio])
  const { series, min: minPrice, max: maxPrice } = useMemo(() => buildChartSeries(zoomState.visible), [zoomState.visible])
  const polyline = useMemo(
    () => (series.length === 0 ? '' : series.map((s) => `${s.x},${s.y}`).join(' ')),
    [series],
  )
  const xTickIndices = useMemo(() => pickXTickIndices(series.length, 6), [series.length])
  const [chartHover, setChartHover] = useState<null | { x: number; y: number; point: AuctionHistoryPoint }>(null)

  const handleSvgWheel = (e: WheelEvent<SVGSVGElement>) => {
    if (pointsWithPrice.length <= 1) return
    e.preventDefault()
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const localRatio = rect.width > 0 ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) : 0.5
    const total = pointsWithPrice.length
    const currentSpanRatio = total > 0 ? (zoomState.end - zoomState.start) / total : 1
    const currentStartRatio = total > 1 ? zoomState.start / (total - 1) : 0
    const currentEndRatio = Math.min(1, currentStartRatio + currentSpanRatio)
    const targetRatio = currentStartRatio + localRatio * Math.max(0, currentEndRatio - currentStartRatio)
    const direction = e.deltaY < 0 ? 1 : -1
    const factor = direction > 0 ? 1.18 : 1 / 1.18
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
    setZoom(nextZoom)
    setZoomCenterRatio(Math.min(1, Math.max(0, targetRatio)))
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
        const rows = await fetchAuctionItemHistory(itemId, range, quality)
        setPoints(rows)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить историю')
        setPoints([])
      } finally {
        setIsLoading(false)
      }
    })()
  }, [opened, itemId, range, quality])

  useEffect(() => {
    setChartHover(null)
  }, [points, zoom, quality, range])

  useEffect(() => {
    setZoom(1)
    setZoomCenterRatio(1)
  }, [range, quality, itemId])

  useEffect(() => {
    if (!opened) {
      setRange('7d')
      setQuality('all')
      setPoints([])
      setError(null)
      setIsLoading(false)
      setZoom(1)
      setZoomCenterRatio(1)
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

        {error ? <Alert color="red">{error}</Alert> : null}
        {isLoading ? <Loader size="sm" /> : null}

        {!isLoading && !error ? (
          <>
            <Text size="sm" c="dimmed">
              {latestPrice !== null ? `Текущая средняя цена: ${formatAuctionRub(latestPrice)} ₽` : 'Нет данных по цене'}
              {` · Лотов: ${totalTrades} · ZOOM x${zoom.toFixed(1)}`}
            </Text>
            {series.length >= 1 ? (
              <Box
                pos="relative"
                p="xs"
                bd="1px solid var(--mantine-color-default-border)"
                style={{ borderRadius: 8 }}
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
                        {formatHistoryAxisLabel(s.point.ts, range)}
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
                      {formatHistoryTooltipTime(chartHover.point.ts)}
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

