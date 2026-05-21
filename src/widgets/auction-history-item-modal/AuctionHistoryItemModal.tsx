import { ActionIcon, Alert, Box, Button, Group, Loader, Modal, ScrollArea, Select, Stack, Text } from '@mantine/core'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type MouseEvent,
  type WheelEvent,
} from 'react'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { AuctionLiquidityBadge } from '../../components/auction-liquidity-badge/AuctionLiquidityBadge'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { appModalStyles } from '../../shared/theme/appModalStyles'
import {
  useAuctionHistoryItemModalStore,
  type AuctionHistoryModalView,
} from '../../shared/store/auctionHistoryItemModalStore'
import { useAuthStore } from '../../shared/store/authStore'
import {
  fetchAuctionItemHistory,
  fetchAuctionItemActiveLots,
  type AuctionActiveLot,
  type AuctionHistoryPoint,
  type AuctionHistoryQuality,
  type AuctionHistoryRange,
  type AuctionHistoryUpgrade,
  type AuctionHistoryZoom,
} from '../../shared/api/backendApi'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'
import { isArtifactDataPath, isModuleCoreItem } from '../../shared/lib/itemKinds'
import { getBackendApiBaseUrl } from '../../shared/config/backendApi'
import { useAuctionLiquidityStore } from '../../shared/store/auctionLiquidityStore'

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
const QUALITY_SELECT_OPTIONS = QUALITY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))
const UPGRADE_SELECT_OPTIONS = UPGRADE_OPTIONS.map((option) => ({
  value: String(option.value),
  label: option.label,
}))

const CHART_VB = { w: 640, h: 280 }
const CHART_MARGIN = { left: 48, right: 12, top: 14, bottom: 54 }
const QUALITY_GLOW_BY_KEY: Record<Exclude<AuctionHistoryQuality, 'all'>, string> = {
  normal: '#ffffff',
  uncommon: '#22c55e',
  special: '#3b82f6',
  rare: '#a855f7',
  exclusive: '#ec4899',
  legendary: '#f59e0b',
  unique: '#B57EDC',
  unknown: '#9ca3af',
}

type ChartSeriesEntry = { point: AuctionHistoryPoint; x: number; y: number }
type AuctionModalViewMode = AuctionHistoryModalView
type ActiveLotsSortKey = 'name' | 'remaining' | 'amount' | 'startPrice' | 'buyoutPrice' | 'pricePerUnit'
type ActiveLotsSortDirection = 'asc' | 'desc'

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

function formatRemaining(endTs: string, nowMs: number): string {
  const d = parseUtcDate(endTs)
  if (!d) return '—'
  const sec = Math.floor((d.getTime() - nowMs) / 1000)
  if (sec <= 0) return 'Завершён'
  const days = Math.floor(sec / 86400)
  const hours = Math.floor((sec % 86400) / 3600)
  const minutes = Math.floor((sec % 3600) / 60)
  const seconds = sec % 60
  const hhmmss = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  if (days > 0) return `${days}д ${hhmmss}`
  return hhmmss
}

export function AuctionHistoryItemModal() {
  const opened = useAuctionHistoryItemModalStore((s) => s.opened)
  const itemId = useAuctionHistoryItemModalStore((s) => s.itemId)
  const initialViewFromStore = useAuctionHistoryItemModalStore((s) => s.initialView)
  const initialQualityFromStore = useAuctionHistoryItemModalStore((s) => s.initialQuality)
  const initialUpgradeFromStore = useAuctionHistoryItemModalStore((s) => s.initialUpgrade)
  const close = useAuctionHistoryItemModalStore((s) => s.close)
  const { itemsById, realm } = useHideoutStore()
  const timezoneOffsetHours = useAuthStore((s) => s.user?.timezoneOffsetHours ?? 0)
  const [range, setRange] = useState<AuctionHistoryRange>('7d')
  const [quality, setQuality] = useState<AuctionHistoryQuality>('all')
  const [upgrade, setUpgrade] = useState<AuctionHistoryUpgrade>('all')
  const [points, setPoints] = useState<AuctionHistoryPoint[]>([])
  const [activeLots, setActiveLots] = useState<AuctionActiveLot[]>([])
  const [viewMode, setViewMode] = useState<AuctionModalViewMode>('history')

  useLayoutEffect(() => {
    if (opened && itemId) {
      setViewMode(initialViewFromStore)
      setQuality(initialQualityFromStore ?? 'all')
      setUpgrade(initialUpgradeFromStore ?? 'all')
    }
  }, [opened, itemId, initialViewFromStore, initialQualityFromStore, initialUpgradeFromStore])

  useEffect(() => {
    if (!opened || !itemId || !getBackendApiBaseUrl()) return
    void useAuctionLiquidityStore.getState().ensureForItems([itemId])
  }, [opened, itemId])
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [activeLotsSortKey, setActiveLotsSortKey] = useState<ActiveLotsSortKey>('buyoutPrice')
  const [activeLotsSortDirection, setActiveLotsSortDirection] = useState<ActiveLotsSortDirection>('asc')
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshingActiveLots, setIsRefreshingActiveLots] = useState(false)
  const [activeLotsRefreshHovered, setActiveLotsRefreshHovered] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState<AuctionHistoryZoom>(1)
  const [hoveredZoom, setHoveredZoom] = useState<AuctionHistoryZoom | null>(null)
  const item = itemId ? itemsById[itemId] : undefined
  const itemName = getItemName(item?.name?.lines)
  const iconUrl = item ? buildItemIconUrl(item.icon, realm) : undefined
  const isArtifact = isArtifactDataPath(item?.data)
  const isModuleCore = isModuleCoreItem(item?.data, itemName || '')
  const showQualityFilter = isArtifact || isModuleCore
  const showUpgradeFilter = isArtifact
  const effectiveQuality: AuctionHistoryQuality = showQualityFilter ? quality : 'all'
  const effectiveUpgrade: AuctionHistoryUpgrade = showUpgradeFilter ? upgrade : 'all'
  const qualitySelectValue = quality
  const upgradeSelectValue = String(upgrade)

  const handleRefreshActiveLots = useCallback(async () => {
    if (!itemId) return
    setIsRefreshingActiveLots(true)
    setError(null)
    try {
      const lots = await fetchAuctionItemActiveLots(itemId, 150)
      setActiveLots(lots)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось обновить лоты')
    } finally {
      setIsRefreshingActiveLots(false)
    }
  }, [itemId])
  const selectedQualityGlowColor =
    showQualityFilter && effectiveQuality !== 'all' ? QUALITY_GLOW_BY_KEY[effectiveQuality] : undefined
  const badgeQualityColor = selectedQualityGlowColor ?? item?.color
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
  const filteredActiveLots = useMemo(() => {
    return activeLots.filter((lot) => {
      const end = parseUtcDate(lot.expiresAt)
      if (end && end.getTime() <= nowMs) return false
      if (showQualityFilter && effectiveQuality !== 'all' && lot.quality !== effectiveQuality) return false
      if (showUpgradeFilter && effectiveUpgrade !== 'all' && lot.upgrade !== effectiveUpgrade) return false
      return true
    })
  }, [activeLots, nowMs, showQualityFilter, showUpgradeFilter, effectiveQuality, effectiveUpgrade])
  const sortedActiveLots = useMemo(() => {
    const getNumeric = (lot: AuctionActiveLot, key: ActiveLotsSortKey): number => {
      if (key === 'remaining') {
        const d = parseUtcDate(lot.expiresAt)
        return d ? d.getTime() : Number.POSITIVE_INFINITY
      }
      if (key === 'amount') return lot.amount
      if (key === 'startPrice') return lot.startPrice !== null ? lot.startPrice * lot.amount : Number.POSITIVE_INFINITY
      if (key === 'buyoutPrice') return (lot.buyoutPrice ?? lot.price) * lot.amount
      if (key === 'pricePerUnit') return lot.price
      return 0
    }
    const rows = [...filteredActiveLots]
    rows.sort((a, b) => {
      let cmp = 0
      if (activeLotsSortKey === 'name') {
        const left = `${itemName || itemId || ''}${isArtifact ? ` +${a.upgrade}` : ''}`
        const right = `${itemName || itemId || ''}${isArtifact ? ` +${b.upgrade}` : ''}`
        cmp = left.localeCompare(right, 'ru')
      } else {
        cmp = getNumeric(a, activeLotsSortKey) - getNumeric(b, activeLotsSortKey)
      }
      return activeLotsSortDirection === 'asc' ? cmp : -cmp
    })
    return rows
  }, [filteredActiveLots, activeLotsSortDirection, activeLotsSortKey, isArtifact, itemId, itemName])
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
        if (viewMode === 'history') {
          const rows = await fetchAuctionItemHistory(itemId, range, effectiveQuality, zoom, effectiveUpgrade)
          setPoints(rows)
          setActiveLots([])
        } else {
          const lots = await fetchAuctionItemActiveLots(itemId, 150)
          setActiveLots(lots)
          setPoints([])
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось загрузить данные')
        setPoints([])
        setActiveLots([])
      } finally {
        setIsLoading(false)
      }
    })()
  }, [opened, itemId, range, effectiveQuality, zoom, effectiveUpgrade, viewMode])

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
      setActiveLots([])
      setError(null)
      setIsLoading(false)
      setZoom(1)
      setViewMode('history')
      setActiveLotsSortKey('buyoutPrice')
      setActiveLotsSortDirection('asc')
    }
  }, [opened])

  useEffect(() => {
    if (!opened || viewMode !== 'activeLots') return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [opened, viewMode])

  useEffect(() => {
    if (!opened || !itemId || viewMode !== 'activeLots') return
    const intervalMs = 60_000
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const lots = await fetchAuctionItemActiveLots(itemId, 150)
          setActiveLots(lots)
        } catch {
          // keep previous rows
        }
      })()
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [opened, itemId, viewMode])

  const toggleActiveLotsSort = (key: ActiveLotsSortKey) => {
    if (activeLotsSortKey === key) {
      setActiveLotsSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setActiveLotsSortKey(key)
    setActiveLotsSortDirection('asc')
  }

  const sortMarker = (key: ActiveLotsSortKey) => {
    if (activeLotsSortKey !== key) return ''
    return activeLotsSortDirection === 'asc' ? ' ▲' : ' ▼'
  }

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
      styles={appModalStyles}
      classNames={{ content: 'app-modal-content' }}
    >
      <Stack gap="sm">
        {itemId ? (
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Stack gap={6}>
                <ItemBadge
                  name={itemName || itemId}
                  iconUrl={iconUrl}
                  qualityColor={badgeQualityColor}
                  size="result"
                  showFavoriteButton={false}
                />
                <AuctionLiquidityBadge itemId={itemId} />
              </Stack>
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
          <Button
            size="xs"
            variant={viewMode === 'history' ? 'filled' : 'default'}
            onClick={() => setViewMode('history')}
          >
            История аукциона
          </Button>
          <Button
            size="xs"
            variant={viewMode === 'activeLots' ? 'filled' : 'default'}
            onClick={() => setViewMode('activeLots')}
          >
            Активные лоты
          </Button>
        </Group>
        {viewMode === 'history' ? (
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
        ) : null}
        {showQualityFilter || showUpgradeFilter ? (
          <Group gap="sm" wrap="nowrap" grow>
            {showQualityFilter ? (
              <Select
                label="Редкость"
                data={QUALITY_SELECT_OPTIONS}
                value={qualitySelectValue}
                onChange={(value) => setQuality((value as AuctionHistoryQuality) ?? 'all')}
                allowDeselect={false}
              />
            ) : (
              <Box />
            )}
            {showUpgradeFilter ? (
              <Select
                label="Заточка"
                data={UPGRADE_SELECT_OPTIONS}
                value={upgradeSelectValue}
                onChange={(value) => {
                  const raw = value ?? 'all'
                  if (raw === 'all') {
                    setUpgrade('all')
                    return
                  }
                  const parsed = Number.parseInt(raw, 10)
                  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 15) {
                    setUpgrade(parsed as AuctionHistoryUpgrade)
                  } else {
                    setUpgrade('all')
                  }
                }}
                allowDeselect={false}
              />
            ) : (
              <Box />
            )}
          </Group>
        ) : null}

        {error ? <Alert color="red">{error}</Alert> : null}

        {viewMode === 'history' ? (
          <Text size="sm" c="dimmed">
            {`${latestPrice !== null ? `Текущая средняя цена: ${formatAuctionRub(latestPrice)} ₽` : 'Нет данных по цене'} · Лотов: ${totalTrades}`}
          </Text>
        ) : (
          <Group
            gap="xs"
            align="center"
            wrap="nowrap"
            onMouseEnter={() => setActiveLotsRefreshHovered(true)}
            onMouseLeave={() => setActiveLotsRefreshHovered(false)}
          >
            <ActionIcon
              variant={activeLotsRefreshHovered ? 'filled' : 'light'}
              color={activeLotsRefreshHovered ? 'blue' : 'gray'}
              radius="md"
              size={26}
              loading={isRefreshingActiveLots}
              onClick={() => void handleRefreshActiveLots()}
              aria-label="Обновить активные лоты"
              title="Обновить активные лоты"
              style={{
                backgroundColor: activeLotsRefreshHovered ? undefined : 'rgba(255,255,255,0.10)',
                transition: 'background-color 140ms ease, color 140ms ease, transform 140ms ease',
                flexShrink: 0,
              }}
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
              size="sm"
              c={activeLotsRefreshHovered ? 'gray.3' : 'dimmed'}
              onClick={() => void handleRefreshActiveLots()}
              style={{ cursor: 'pointer', transition: 'color 120ms ease' }}
              title="Обновить активные лоты"
            >
              {`Активных лотов: ${sortedActiveLots.length} · Объём: ${new Intl.NumberFormat('ru-RU').format(
                sortedActiveLots.reduce((sum, lot) => sum + lot.amount, 0),
              )} шт. · Общая стоимость: ${formatAuctionRub(
                sortedActiveLots.reduce((sum, lot) => sum + lot.amount * lot.price, 0),
              )} ₽`}
            </Text>
          </Group>
        )}
        {viewMode === 'history' ? (
          <Group gap="xs" align="center" wrap="wrap">
            <Text size="sm" c="dimmed">
              ZOOM x{zoom}
            </Text>
            {ZOOM_LEVELS.map((level) => {
              const isActive = zoom === level
              const isHovered = hoveredZoom === level
              return (
                <Button
                  key={`zoom-btn-${level}`}
                  size="compact-xs"
                  radius="md"
                  variant={isActive || isHovered ? 'filled' : 'light'}
                  color={isActive || isHovered ? 'blue' : 'gray'}
                  onMouseEnter={() => setHoveredZoom(level)}
                  onMouseLeave={() => setHoveredZoom(null)}
                  onClick={() => setZoom(level)}
                  style={{
                    minWidth: 34,
                    backgroundColor: isActive || isHovered ? undefined : 'rgba(255,255,255,0.10)',
                    transition: 'background-color 140ms ease, color 140ms ease, transform 140ms ease',
                  }}
                >
                  {level}x
                </Button>
              )
            })}
          </Group>
        ) : null}

        {viewMode === 'history' ? (
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
        ) : (
          <Box
            mt="xs"
            p={0}
            bd="1px solid var(--mantine-color-default-border)"
            style={{
              borderRadius: 8,
              width: '100%',
              height: 330,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {!isLoading && sortedActiveLots.length === 0 ? (
              <Box
                px="sm"
                py="lg"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}
              >
                <Text size="sm" c="dimmed">
                  Нет активных лотов.
                </Text>
              </Box>
            ) : null}
            {!isLoading && sortedActiveLots.length > 0 ? (
              <>
                <Group
                  justify="space-between"
                  wrap="nowrap"
                  style={{
                    flexShrink: 0,
                    background: 'rgba(255,255,255,0.03)',
                    fontSize: 12,
                    padding: '6px 10px',
                    borderBottom: '1px solid var(--mantine-color-default-border)',
                  }}
                >
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{ width: 240, cursor: 'pointer' }}
                    onClick={() => toggleActiveLotsSort('name')}
                  >
                    Лот{sortMarker('name')}
                  </Text>
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{ width: 88, textAlign: 'right', cursor: 'pointer' }}
                    onClick={() => toggleActiveLotsSort('remaining')}
                  >
                    Осталось{sortMarker('remaining')}
                  </Text>
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{ width: 90, textAlign: 'right', cursor: 'pointer' }}
                    onClick={() => toggleActiveLotsSort('amount')}
                  >
                    Кол-во{sortMarker('amount')}
                  </Text>
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{ width: 110, textAlign: 'right', cursor: 'pointer' }}
                    onClick={() => toggleActiveLotsSort('startPrice')}
                  >
                    Старт{sortMarker('startPrice')}
                  </Text>
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{ width: 120, textAlign: 'right', cursor: 'pointer' }}
                    onClick={() => toggleActiveLotsSort('buyoutPrice')}
                  >
                    Выкуп{sortMarker('buyoutPrice')}
                  </Text>
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{ width: 120, textAlign: 'right', cursor: 'pointer' }}
                    onClick={() => toggleActiveLotsSort('pricePerUnit')}
                  >
                    Цена/шт{sortMarker('pricePerUnit')}
                  </Text>
                </Group>
                <ScrollArea
                  scrollbars="y"
                  type="scroll"
                  scrollbarSize={5}
                  style={{ flex: 1, minHeight: 0 }}
                  styles={{
                    root: { flex: 1, minHeight: 0, padding: 0 },
                    viewport: { paddingBottom: 0, paddingRight: 2 },
                    corner: { display: 'none' },
                    scrollbar: { width: 5, padding: 0 },
                  }}
                >
                  <Stack gap={0}>
                  {sortedActiveLots.map((lot, idx) => {
                    const qualityGlow =
                      lot.quality !== 'unknown'
                        ? QUALITY_GLOW_BY_KEY[lot.quality as Exclude<AuctionHistoryQuality, 'all'>]
                        : item?.color
                    const displayName = isArtifact ? `${itemName || itemId} +${lot.upgrade}` : itemName || itemId || 'Лот'
                    return (
                      <Group
                        key={`active-lot-${idx}-${lot.price}-${lot.amount}`}
                        justify="space-between"
                        align="center"
                        style={{
                          padding: '6px 10px',
                          background: idx % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                        }}
                        wrap="nowrap"
                      >
                        <Box style={{ width: 240, minWidth: 240 }}>
                          <ItemBadge
                            name={displayName}
                            iconUrl={iconUrl}
                            qualityColor={qualityGlow}
                            size="ingredient"
                            showFavoriteButton={false}
                            openDetailsOnClick={false}
                          />
                        </Box>
                        <Text size="sm" style={{ width: 88, textAlign: 'right' }}>
                          {formatRemaining(lot.expiresAt, nowMs)}
                        </Text>
                        <Text size="sm" style={{ width: 90, textAlign: 'right' }}>
                          {new Intl.NumberFormat('ru-RU').format(lot.amount)}
                        </Text>
                        <Text size="sm" style={{ width: 110, textAlign: 'right' }}>
                          {lot.startPrice !== null ? `${formatAuctionRub(lot.startPrice * lot.amount)} ₽` : '—'}
                        </Text>
                        <Text size="sm" style={{ width: 120, textAlign: 'right' }}>
                          {lot.buyoutPrice !== null
                            ? `${formatAuctionRub(lot.buyoutPrice * lot.amount)} ₽`
                            : `${formatAuctionRub(lot.price * lot.amount)} ₽`}
                        </Text>
                        <Text size="sm" fw={600} style={{ width: 120, textAlign: 'right' }}>
                          {formatAuctionRub(lot.price)} ₽
                        </Text>
                      </Group>
                    )
                  })}
                  </Stack>
                </ScrollArea>
              </>
            ) : null}
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
        )}
      </Stack>
    </Modal>
  )
}

