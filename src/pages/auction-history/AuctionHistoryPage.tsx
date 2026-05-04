import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { AuctionPrice24hLine } from '../../components/auction-price-24h/AuctionPrice24hLine'
import {
  addTrackedAuctionItem,
  fetchAuctionItemActiveLots,
  fetchTrackedAuctionItems,
  removeTrackedAuctionItem,
  resolveAuctionItemIdByExactName,
  type AuctionActiveLot,
} from '../../shared/api/backendApi'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { authModalGlowModalStyles } from '../../shared/lib/authModalGlowStyles'
import { useAuctionHistoryItemModalStore } from '../../shared/store/auctionHistoryItemModalStore'
import { minActiveLotUnitPrice } from '../../shared/lib/auctionActiveLotsUtils'
import { playAuctionDealSound } from '../../shared/lib/playAuctionDealSound'
import {
  readQualifyingEdgeSnapshot,
  writeQualifyingEdgeSnapshot,
} from '../../shared/lib/auctionQualifyingEdgeStorage'
import { useAuctionDesiredBuyPricesStore } from '../../shared/store/auctionDesiredBuyPricesStore'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'

const ACTIVE_LOTS_POLL_MS = 90_000

function parseDesiredBuyRub(raw: string | undefined): number | null {
  const digits = (raw ?? '').replace(/[^\d]/g, '')
  if (digits === '') return null
  const n = Number(digits)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

type DealToast = {
  id: string
  itemId: string
  name: string
  minPrice: number
}

export function AuctionHistoryPage() {
  const { itemsById, realm, isLoading, error, fetchRecipes } = useHideoutStore()
  const desiredBuyByItemId = useAuctionDesiredBuyPricesStore((s) => s.desiredBuyByItemId)
  const setDesiredBuyPrice = useAuctionDesiredBuyPricesStore((s) => s.setDesiredBuyPrice)
  const [trackedItemIds, setTrackedItemIds] = useState<string[]>([])
  const [isLoadingTracked, setIsLoadingTracked] = useState(false)
  const [search, setSearch] = useState('')
  const [isModalOpened, setIsModalOpened] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  const [manualItemName, setManualItemName] = useState('')
  const [isAddingItemId, setIsAddingItemId] = useState<string | null>(null)
  const [isRemovingItemId, setIsRemovingItemId] = useState<string | null>(null)
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string | null>(null)
  const [trackedError, setTrackedError] = useState<string | null>(null)
  const openAuctionHistoryItemModal = useAuctionHistoryItemModalStore((s) => s.open)
  const [lotsByItemId, setLotsByItemId] = useState<Record<string, AuctionActiveLot[]>>({})
  const [dealToasts, setDealToasts] = useState<DealToast[]>([])
  const [lotEvalNowMs, setLotEvalNowMs] = useState(() => Date.now())
  const toastTimeoutsByIdRef = useRef<Map<string, number>>(new Map())

  const dismissToast = useCallback((id: string) => {
    const tid = toastTimeoutsByIdRef.current.get(id)
    if (tid !== undefined) {
      window.clearTimeout(tid)
      toastTimeoutsByIdRef.current.delete(id)
    }
    setDealToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const pushDealToast = useCallback(
    (toast: DealToast) => {
      setDealToasts((prev) => [...prev, toast])
      const tid = window.setTimeout(() => {
        toastTimeoutsByIdRef.current.delete(toast.id)
        setDealToasts((prev) => prev.filter((t) => t.id !== toast.id))
      }, 10_000)
      toastTimeoutsByIdRef.current.set(toast.id, tid)
    },
    [],
  )

  useEffect(() => {
    const timeoutsRef = toastTimeoutsByIdRef
    return () => {
      const pending = timeoutsRef.current
      for (const tid of pending.values()) {
        window.clearTimeout(tid)
      }
      pending.clear()
    }
  }, [])

  useEffect(() => {
    if (trackedItemIds.length === 0) return
    const id = window.setInterval(() => setLotEvalNowMs(Date.now()), 5000)
    return () => window.clearInterval(id)
  }, [trackedItemIds.length])

  useEffect(() => {
    void fetchRecipes()
  }, [fetchRecipes])

  useEffect(() => {
    void (async () => {
      setIsLoadingTracked(true)
      setTrackedError(null)
      try {
        const ids = await fetchTrackedAuctionItems()
        setTrackedItemIds(ids)
      } catch (e) {
        setTrackedError(e instanceof Error ? e.message : 'Не удалось загрузить отслеживаемые предметы')
      } finally {
        setIsLoadingTracked(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (trackedItemIds.length === 0) {
      setLotsByItemId({})
      return
    }

    let cancelled = false

    const runPoll = async () => {
      const entries = await Promise.all(
        trackedItemIds.map(async (itemId) => {
          try {
            const lots = await fetchAuctionItemActiveLots(itemId, 150)
            return [itemId, lots] as const
          } catch {
            return [itemId, [] as AuctionActiveLot[]] as const
          }
        }),
      )
      if (cancelled) return

      const nextLots: Record<string, AuctionActiveLot[]> = {}
      for (const [itemId, lots] of entries) {
        nextLots[itemId] = lots
      }
      setLotsByItemId((prev) => ({ ...prev, ...nextLots }))

      const nowMs = Date.now()
      const desired = useAuctionDesiredBuyPricesStore.getState().desiredBuyByItemId
      const prevEdge = readQualifyingEdgeSnapshot()
      const nextEdge: Record<string, boolean> = {}
      const hideout = useHideoutStore.getState()

      for (const itemId of trackedItemIds) {
        const lots = nextLots[itemId] ?? []
        const threshold = parseDesiredBuyRub(desired[itemId])
        const minP = minActiveLotUnitPrice(lots, nowMs)
        const qualifying = threshold !== null && minP !== null && minP <= threshold
        nextEdge[itemId] = qualifying

        if (qualifying && prevEdge[itemId] !== true && minP !== null) {
          const item = hideout.itemsById[itemId]
          const name = getItemName(item?.name?.lines) || itemId
          pushDealToast({
            id: `${Date.now()}-${itemId}-${Math.random().toString(16).slice(2)}`,
            itemId,
            name,
            minPrice: minP,
          })
          playAuctionDealSound()
        }
      }

      writeQualifyingEdgeSnapshot(nextEdge)
    }

    void runPoll()
    const intervalId = window.setInterval(() => void runPoll(), ACTIVE_LOTS_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [trackedItemIds, pushDealToast])

  const trackedItems = useMemo(() => {
    return trackedItemIds
      .map((itemId) => {
        const item = itemsById[itemId]
        return {
          itemId,
          name: getItemName(item?.name?.lines) || itemId,
          iconUrl: item ? buildItemIconUrl(item.icon, realm) : undefined,
          qualityColor: item?.color,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [itemsById, realm, trackedItemIds])

  const filteredTrackedItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return trackedItems
    return trackedItems.filter((item) => `${item.name} ${item.itemId}`.toLowerCase().includes(query))
  }, [search, trackedItems])

  const allItems = useMemo(() => {
    return Object.values(itemsById)
      .map((item) => ({
        itemId: item.id,
        name: getItemName(item.name?.lines) || item.id,
        iconUrl: buildItemIconUrl(item.icon, realm),
        qualityColor: item.color,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [itemsById, realm])

  const filteredModalItems = useMemo(() => {
    const query = modalSearch.trim().toLowerCase()
    if (!query) return allItems
    return allItems.filter((item) => `${item.name} ${item.itemId}`.toLowerCase().includes(query))
  }, [allItems, modalSearch])

  const trackedSet = useMemo(() => new Set(trackedItemIds), [trackedItemIds])
  const pendingDeleteItem = useMemo(
    () => trackedItems.find((item) => item.itemId === pendingDeleteItemId) ?? null,
    [pendingDeleteItemId, trackedItems],
  )

  return (
    <PageContainer>
      <SectionCard title="" description="">
        <Stack gap="md">
          <Text size="xl" fw={700}>
            Отслеживание аукциона
          </Text>

          <Group align="flex-end" wrap="wrap">
            <TextInput
              placeholder="Поиск: название или ID предмета..."
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              style={{ flex: 1, minWidth: 280 }}
            />
            <Button
              onClick={() => {
                setModalSearch('')
                setManualItemName('')
                setTrackedError(null)
                setIsModalOpened(true)
              }}
            >
              Отслеживать новый предмет
            </Button>
          </Group>

          {trackedError ? <Alert color="red">{trackedError}</Alert> : null}
          {isLoading || isLoadingTracked ? <Loader size="sm" /> : null}
          {error ? <Alert color="red">{error}</Alert> : null}

          {!isLoading && !isLoadingTracked ? (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
              {filteredTrackedItems.map((item) => {
                const desiredRaw = desiredBuyByItemId[item.itemId] ?? ''
                const threshold = parseDesiredBuyRub(desiredRaw)
                const minP = minActiveLotUnitPrice(lotsByItemId[item.itemId] ?? [], lotEvalNowMs)
                const isDeal = threshold !== null && minP !== null && minP <= threshold
                return (
                <Stack
                  key={item.itemId}
                  gap={6}
                  p="md"
                  bd="1px solid var(--mantine-color-default-border)"
                  style={{
                    borderRadius: 8,
                    boxShadow: isDeal
                      ? '0 0 22px 6px rgba(34, 197, 94, 0.72), 0 0 0 1px rgba(34, 197, 94, 0.35)'
                      : undefined,
                    transition: 'box-shadow 220ms ease',
                  }}
                >
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <ItemBadge
                      itemId={item.itemId}
                      name={item.name}
                      iconUrl={item.iconUrl}
                      qualityColor={item.qualityColor}
                      size="result"
                      showFavoriteButton={false}
                      openDetailsOnClick={false}
                      onClick={() => openAuctionHistoryItemModal(item.itemId)}
                    />
                    <ActionIcon
                      size={40}
                      color="red"
                      variant="light"
                      aria-label="Удалить из отслеживания"
                      title="Удалить из отслеживания"
                      loading={isRemovingItemId === item.itemId}
                      onClick={() => setPendingDeleteItemId(item.itemId)}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </ActionIcon>
                  </Group>
                  <AuctionPrice24hLine
                    itemId={item.itemId}
                    size="sm"
                    showNoCacheHint={false}
                    hideWhenNoData
                  />
                  <TextInput
                    label="Желаемая стоимость скупа"
                    placeholder="₽ за 1 ед."
                    value={desiredRaw}
                    onChange={(event) => {
                      const sanitized = event.currentTarget.value.replace(/[^\d]/g, '')
                      setDesiredBuyPrice(item.itemId, sanitized)
                    }}
                  />
                </Stack>
                )
              })}
            </SimpleGrid>
          ) : null}
        </Stack>
      </SectionCard>

      <Stack
        gap="sm"
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 1000,
          maxWidth: 360,
          width: 'min(360px, calc(100vw - 32px))',
          pointerEvents: 'none',
        }}
      >
        {dealToasts.map((toast) => (
          <Paper
            key={toast.id}
            shadow="md"
            p="sm"
            withBorder
            style={{ pointerEvents: 'auto', background: 'var(--mantine-color-body)' }}
          >
            <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
              <Stack gap={4} style={{ minWidth: 0 }}>
                <Text size="sm" fw={700} lineClamp={2}>
                  Выгодный лот: {toast.name}
                </Text>
                <Text size="xs" c="dimmed">
                  От {formatAuctionRub(toast.minPrice)} ₽/ед. при вашем скупе
                </Text>
              </Stack>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Закрыть уведомление"
                onClick={() => dismissToast(toast.id)}
              >
                ✕
              </ActionIcon>
            </Group>
          </Paper>
        ))}
      </Stack>

      <Modal
        opened={isModalOpened}
        onClose={() => setIsModalOpened(false)}
        title={null}
        withCloseButton={false}
        centered
        size="lg"
        removeScrollProps={{
          removeScrollBar: false,
        }}
        styles={authModalGlowModalStyles}
      >
        <Stack gap="sm">
          <Text size="lg" fw={700}>
            Добавить предмет в отслеживание
          </Text>
          <TextInput
            placeholder="Поиск по всем предметам STALCRAFT..."
            value={modalSearch}
            onChange={(event) => setModalSearch(event.currentTarget.value)}
          />
          <Group align="flex-end" wrap="nowrap">
            <TextInput
              label="Добавить по точному названию"
              placeholder="Например: Дар шепота"
              value={manualItemName}
              onChange={(event) => setManualItemName(event.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button
              loading={isAddingItemId === '__manual__'}
              disabled={manualItemName.trim() === ''}
              onClick={async () => {
                const normalized = manualItemName.trim()
                if (!normalized) return
                setIsAddingItemId('__manual__')
                setTrackedError(null)
                try {
                  const resolvedItemId = await resolveAuctionItemIdByExactName(normalized)
                  await addTrackedAuctionItem(resolvedItemId)
                  setTrackedItemIds((prev) => [...new Set([...prev, resolvedItemId])])
                  setManualItemName('')
                } catch (e) {
                  setTrackedError(
                    e instanceof Error ? e.message : 'Не удалось добавить предмет в отслеживание',
                  )
                } finally {
                  setIsAddingItemId(null)
                }
              }}
            >
              Добавить
            </Button>
          </Group>
          <ScrollArea.Autosize mah="60vh">
            <Stack gap="xs">
              {filteredModalItems.map((item) => (
                <Group
                  key={`modal-item-${item.itemId}`}
                  justify="space-between"
                  align="center"
                  p="xs"
                  bd="1px solid var(--mantine-color-default-border)"
                  style={{ borderRadius: 8 }}
                  wrap="nowrap"
                >
                  <ItemBadge
                    name={item.name}
                    iconUrl={item.iconUrl}
                    qualityColor={item.qualityColor}
                    size="ingredient"
                    showFavoriteButton={false}
                  />
                  <Button
                    size="sm"
                    disabled={trackedSet.has(item.itemId)}
                    loading={isAddingItemId === item.itemId}
                    style={{ minWidth: 112, whiteSpace: 'nowrap', flexShrink: 0 }}
                    onClick={async () => {
                      setIsAddingItemId(item.itemId)
                      setTrackedError(null)
                      try {
                        await addTrackedAuctionItem(item.itemId)
                        setTrackedItemIds((prev) => [...new Set([...prev, item.itemId])])
                      } catch (e) {
                        setTrackedError(
                          e instanceof Error ? e.message : 'Не удалось добавить предмет в отслеживание',
                        )
                      } finally {
                        setIsAddingItemId(null)
                      }
                    }}
                  >
                    {trackedSet.has(item.itemId) ? 'Добавлено' : 'Добавить'}
                  </Button>
                </Group>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </Modal>

      <Modal
        opened={pendingDeleteItem !== null}
        onClose={() => {
          if (!isRemovingItemId) setPendingDeleteItemId(null)
        }}
        title={null}
        withCloseButton={false}
        centered
        size="sm"
        removeScrollProps={{
          removeScrollBar: false,
        }}
        styles={authModalGlowModalStyles}
      >
        <Stack gap="sm">
          <Text size="md" fw={700}>
            Подтверждение удаления
          </Text>
          <Text size="sm">
            Удалить предмет «{pendingDeleteItem?.name ?? pendingDeleteItem?.itemId ?? ''}» из отслеживания?
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              color="gray"
              disabled={Boolean(isRemovingItemId)}
              onClick={() => setPendingDeleteItemId(null)}
            >
              Отмена
            </Button>
            <Button
              color="red"
              loading={Boolean(isRemovingItemId)}
              onClick={async () => {
                if (!pendingDeleteItem) return
                setIsRemovingItemId(pendingDeleteItem.itemId)
                setTrackedError(null)
                try {
                  await removeTrackedAuctionItem(pendingDeleteItem.itemId)
                  setTrackedItemIds((prev) => prev.filter((id) => id !== pendingDeleteItem.itemId))
                  setPendingDeleteItemId(null)
                } catch (e) {
                  setTrackedError(
                    e instanceof Error ? e.message : 'Не удалось удалить предмет из отслеживания',
                  )
                } finally {
                  setIsRemovingItemId(null)
                }
              }}
            >
              Удалить
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageContainer>
  )
}

