import { ActionIcon, Alert, Box, Button, Group, Loader, Modal, ScrollArea, Select, Stack, Text } from '@mantine/core'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { ItemBadge } from '../../components/item-badge/ItemBadge'

const AuctionHistoryPriceChart = lazy(() =>
  import('../../components/auction-history-chart/AuctionHistoryPriceChart').then((m) => ({
    default: m.AuctionHistoryPriceChart,
  })),
)
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

type AuctionModalViewMode = AuctionHistoryModalView
type ActiveLotsSortKey = 'name' | 'remaining' | 'amount' | 'startPrice' | 'buyoutPrice' | 'pricePerUnit'
type ActiveLotsSortDirection = 'asc' | 'desc'

function parseUtcDate(ts: string): Date | null {
  const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z'
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return null
  return d
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
          <Box pos="relative" style={{ minHeight: 350 }}>
            <Suspense
              fallback={
                <Box
                  style={{
                    minHeight: 300,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Loader size="sm" />
                </Box>
              }
            >
              <AuctionHistoryPriceChart
                points={points}
                range={range}
                zoom={zoom}
                timezoneOffsetHours={timezoneOffsetHours}
                zoomLevels={ZOOM_LEVELS}
                onZoomChange={setZoom}
              />
            </Suspense>
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

