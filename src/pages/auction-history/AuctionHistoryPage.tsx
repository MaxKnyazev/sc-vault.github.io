import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  ScrollArea,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import {
  addTrackedAuctionItem,
  fetchTrackedAuctionItems,
  removeTrackedAuctionItem,
  resolveAuctionItemIdByExactName,
  type AuctionHistoryQuality,
  type AuctionHistoryUpgrade,
  type TrackedItemSubscription,
} from '../../shared/api/backendApi'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { authModalGlowModalStyles } from '../../shared/lib/authModalGlowStyles'
import { useAuctionHistoryItemModalStore } from '../../shared/store/auctionHistoryItemModalStore'
import { minActiveLotUnitPrice } from '../../shared/lib/auctionActiveLotsUtils'
import { parseDesiredBuyRub } from '../../shared/lib/parseDesiredBuyRub'
import { useAuctionDesiredBuyPricesStore } from '../../shared/store/auctionDesiredBuyPricesStore'
import { useAuctionTrackedLotsStore } from '../../shared/store/auctionTrackedLotsStore'
import { useAuctionTrackedSubscriptionsStore } from '../../shared/store/auctionTrackedSubscriptionsStore'
import { useAuthStore } from '../../shared/store/authStore'
import { isArtifactDataPath, isModuleCoreItem } from '../../shared/lib/itemKinds'

type TrackedRow = {
  itemId: string
  name: string
  iconUrl?: string
  qualityColor?: string
  dataPath?: string
}

type TrackingKind = 'plain' | 'core' | 'artifact'

function classifyTrackingKind(dataPath: string | undefined, name: string): TrackingKind {
  if (isArtifactDataPath(dataPath)) return 'artifact'
  if (dataPath && isModuleCoreItem(dataPath, name)) return 'core'
  return 'plain'
}

function subscriptionKey(
  s: Pick<TrackedItemSubscription, 'itemId' | 'kind' | 'quality' | 'upgradeMin' | 'upgradeMax'>,
): string {
  return `${s.itemId}|${s.kind}|${s.quality}|${s.upgradeMin}|${s.upgradeMax}`
}

function pickQualityColor(rawColor: string | undefined, statusState: string | undefined): string | undefined {
  const c = (rawColor ?? '').trim()
  const s = (statusState ?? '').trim()
  if (
    s &&
    (c === '' || c.toLowerCase() === '#ffffff' || c.toUpperCase() === 'DEFAULT' || c.toUpperCase() === 'NORMAL')
  ) {
    return s
  }
  return c || s || undefined
}

const WIZ_CORE_QUALITIES: Array<{ value: AuctionHistoryQuality; label: string }> = [
  { value: 'normal', label: 'Обычная' },
  { value: 'uncommon', label: 'Необычная' },
  { value: 'special', label: 'Особая' },
  { value: 'rare', label: 'Редкая' },
  { value: 'exclusive', label: 'Исключительная' },
  { value: 'legendary', label: 'Легендарная' },
]

const WIZ_CORE_QUALITY_OPTIONS: Array<{ value: AuctionHistoryQuality; label: string }> = [
  { value: 'all', label: 'Все' },
  ...WIZ_CORE_QUALITIES,
]

const WIZ_ARTIFACT_QUALITY_OPTIONS: Array<{ value: AuctionHistoryQuality; label: string }> = [
  { value: 'all', label: 'Все' },
  ...WIZ_CORE_QUALITIES,
  { value: 'unique', label: 'Уникальная' },
]

export function AuctionHistoryPage() {
  const { itemsById, realm, isLoading, error, fetchRecipes } = useHideoutStore()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const desiredBuyByItemId = useAuctionDesiredBuyPricesStore((s) => s.desiredBuyByItemId)
  const saveDesiredBuyPrice = useAuctionDesiredBuyPricesStore((s) => s.saveDesiredBuyPrice)

  const subscriptions = useAuctionTrackedSubscriptionsStore((s) => s.subscriptions)
  const subsLoading = useAuctionTrackedSubscriptionsStore((s) => s.isLoading)
  const subsError = useAuctionTrackedSubscriptionsStore((s) => s.error)
  const upsertSubscription = useAuctionTrackedSubscriptionsStore((s) => s.upsert)
  const removeSubscription = useAuctionTrackedSubscriptionsStore((s) => s.remove)
  const loadSubscriptions = useAuctionTrackedSubscriptionsStore((s) => s.loadRemote)

  const [mineIds, setMineIds] = useState<string[]>([])
  const [globalIds, setGlobalIds] = useState<string[]>([])
  const [listsError, setListsError] = useState<string | null>(null)
  const [isLoadingLists, setIsLoadingLists] = useState(true)

  const [activeTab, setActiveTab] = useState<string>('mine')
  const [search, setSearch] = useState('')
  const [isModalOpened, setIsModalOpened] = useState(false)
  const [modalSearch, setModalSearch] = useState('')
  const [manualItemName, setManualItemName] = useState('')
  const [isAddingItemId, setIsAddingItemId] = useState<string | null>(null)
  const [isRemovingItemId, setIsRemovingItemId] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<null | { scope: 'my' | 'global'; item: TrackedRow }>(null)
  const [trackedError, setTrackedError] = useState<string | null>(null)
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})
  const [savingPriceItemId, setSavingPriceItemId] = useState<string | null>(null)
  const [subPriceDrafts, setSubPriceDrafts] = useState<Record<string, string>>({})
  const [savingSubKey, setSavingSubKey] = useState<string | null>(null)

  const [subscriptionWizard, setSubscriptionWizard] = useState<null | {
    itemId: string
    name: string
    trackKind: 'core' | 'artifact'
    ensureTracked: boolean
  }>(null)
  const [wizQuality, setWizQuality] = useState<AuctionHistoryQuality | null>(null)
  const [wizUpgMin, setWizUpgMin] = useState('0')
  const [wizUpgMax, setWizUpgMax] = useState('15')
  const [wizPrice, setWizPrice] = useState('')
  const [wizSaving, setWizSaving] = useState(false)
  const [wizError, setWizError] = useState<string | null>(null)

  const openAuctionHistoryItemModal = useAuctionHistoryItemModalStore((s) => s.open)
  const lotsByItemId = useAuctionTrackedLotsStore((s) => s.lotsByItemId)
  const [lotEvalNowMs, setLotEvalNowMs] = useState(() => Date.now())

  const reloadLists = useCallback(async () => {
    setIsLoadingLists(true)
    setListsError(null)
    try {
      const [mine, global] = await Promise.all([
        fetchTrackedAuctionItems('mine'),
        fetchTrackedAuctionItems('global'),
      ])
      setMineIds(mine)
      setGlobalIds(global)
    } catch (e) {
      setListsError(e instanceof Error ? e.message : 'Не удалось загрузить списки отслеживания')
    } finally {
      setIsLoadingLists(false)
    }
  }, [])

  useEffect(() => {
    void fetchRecipes()
  }, [fetchRecipes])

  useEffect(() => {
    void reloadLists()
    void useAuctionDesiredBuyPricesStore.getState().loadRemote()
    void loadSubscriptions()
  }, [reloadLists, loadSubscriptions])

  useEffect(() => {
    const ids = mineIds
    if (ids.length === 0) return
    const id = window.setInterval(() => setLotEvalNowMs(Date.now()), 5000)
    return () => window.clearInterval(id)
  }, [mineIds.length])

  useEffect(() => {
    setPriceDrafts((prev) => {
      const next = { ...prev }
      for (const itemId of mineIds) {
        if (next[itemId] === undefined) {
          next[itemId] = desiredBuyByItemId[itemId] ?? ''
        }
      }
      for (const k of Object.keys(next)) {
        if (!mineIds.includes(k)) delete next[k]
      }
      return next
    })
  }, [mineIds, desiredBuyByItemId])

  useEffect(() => {
    setSubPriceDrafts((prev) => {
      const next = { ...prev }
      for (const s of subscriptions) {
        const k = subscriptionKey(s)
        if (next[k] === undefined) next[k] = s.desiredBuyPrice ?? ''
      }
      for (const k of Object.keys(next)) {
        if (!subscriptions.some((s) => subscriptionKey(s) === k)) delete next[k]
      }
      return next
    })
  }, [subscriptions])

  const mineSet = useMemo(() => new Set(mineIds), [mineIds])

  const toRows = useCallback(
    (ids: string[]): TrackedRow[] => {
      return ids
        .map((itemId) => {
          const item = itemsById[itemId]
          return {
            itemId,
            name: getItemName(item?.name?.lines) || itemId,
            iconUrl: item ? buildItemIconUrl(item.icon, realm) : undefined,
            qualityColor: item ? pickQualityColor(item.color, item.status?.state) : undefined,
            dataPath: item?.data,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    },
    [itemsById, realm],
  )

  const qualityLabelRu: Record<string, string> = {
    all: 'Все',
    normal: 'Обычная',
    uncommon: 'Необычная',
    special: 'Особая',
    rare: 'Редкая',
    exclusive: 'Исключительная',
    legendary: 'Легендарная',
    unique: 'Уникальная',
  }

  const upgradeRangeOptions = useMemo(
    () => Array.from({ length: 16 }, (_, i) => ({ value: String(i), label: `+${i}` })),
    [],
  )

  const mineRows = useMemo(() => toRows(mineIds), [mineIds, toRows])
  const globalRows = useMemo(() => toRows(globalIds), [globalIds, toRows])

  const filteredMineRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return mineRows
    return mineRows.filter((item) => `${item.name} ${item.itemId}`.toLowerCase().includes(q))
  }, [mineRows, search])

  const filteredGlobalRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return globalRows
    return globalRows.filter((item) => `${item.name} ${item.itemId}`.toLowerCase().includes(q))
  }, [globalRows, search])

  const allItems = useMemo(() => {
    return Object.values(itemsById)
      .map((item) => ({
        itemId: item.id,
        name: getItemName(item.name?.lines) || item.id,
        iconUrl: buildItemIconUrl(item.icon, realm),
        qualityColor: item.color,
        dataPath: item.data,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [itemsById, realm])

  const filteredModalItems = useMemo(() => {
    const query = modalSearch.trim().toLowerCase()
    if (!query) return allItems
    return allItems.filter((item) => `${item.name} ${item.itemId}`.toLowerCase().includes(query))
  }, [allItems, modalSearch])

  const openSubscriptionWizard = (args: {
    itemId: string
    name: string
    dataPath?: string
    ensureTracked: boolean
  }) => {
    const tk = classifyTrackingKind(args.dataPath, args.name)
    if (tk === 'plain') return
    setIsModalOpened(false)
    setWizError(null)
    setSubscriptionWizard({
      itemId: args.itemId,
      name: args.name,
      trackKind: tk,
      ensureTracked: args.ensureTracked,
    })
    setWizQuality(null)
    setWizUpgMin('0')
    setWizUpgMax('15')
    setWizPrice('')
  }

  const getModalButtonLabel = (row: { itemId: string; name: string; dataPath?: string }) => {
    const tk = classifyTrackingKind(row.dataPath, row.name)
    if (!mineSet.has(row.itemId)) {
      if (tk === 'plain') return 'Добавить'
      return 'Добавить…'
    }
    if (tk === 'core' || tk === 'artifact') return 'Вариант'
    return 'В моих'
  }

  const isModalPrimaryDisabled = (row: { itemId: string; name: string; dataPath?: string }) => {
    const tk = classifyTrackingKind(row.dataPath, row.name)
    if (!mineSet.has(row.itemId)) return false
    return tk === 'plain'
  }

  const wizQualityOptions =
    subscriptionWizard?.trackKind === 'artifact' ? WIZ_ARTIFACT_QUALITY_OPTIONS : WIZ_CORE_QUALITY_OPTIONS

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
                void reloadLists().then(() => setIsModalOpened(true))
              }}
            >
              Отслеживать новый предмет
            </Button>
          </Group>

          {listsError ? <Alert color="red">{listsError}</Alert> : null}
          {trackedError ? <Alert color="red">{trackedError}</Alert> : null}
          {subsError ? <Alert color="red">{subsError}</Alert> : null}
          {isLoading || isLoadingLists ? <Loader size="sm" /> : null}
          {subsLoading ? <Loader size="xs" /> : null}
          {error ? <Alert color="red">{error}</Alert> : null}

          {!isLoading && !isLoadingLists ? (
            <Tabs value={activeTab} onChange={(v) => setActiveTab(v ?? 'mine')}>
              <Tabs.List>
                <Tabs.Tab value="mine">Мои отслеживания</Tabs.Tab>
                <Tabs.Tab value="global">Все отслеживания</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="mine" pt="md">
                <Stack gap="md">
                  {subscriptions.filter((s) => mineSet.has(s.itemId)).length > 0 ? (
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                      {subscriptions
                        .filter((s) => mineSet.has(s.itemId))
                        .map((s) => {
                          const item = itemsById[s.itemId]
                          const name = getItemName(item?.name?.lines) || s.itemId
                          const iconUrl = item ? buildItemIconUrl(item.icon, realm) : undefined
                          const qualityColor = item
                            ? pickQualityColor(item.color, item.status?.state)
                            : undefined
                          const k = subscriptionKey(s)
                          const draft = subPriceDrafts[k] ?? s.desiredBuyPrice ?? ''
                          const title =
                            s.kind === 'core'
                              ? `Ядро — ${qualityLabelRu[s.quality] ?? s.quality}`
                              : `Артефакт — ${qualityLabelRu[s.quality] ?? s.quality} (+${s.upgradeMin}…+${s.upgradeMax})`
                          const lots = lotsByItemId[s.itemId] ?? []
                          const filtered = lots.filter((lot) => {
                            if (s.quality !== 'all' && lot.quality !== s.quality) return false
                            if (s.kind === 'core') return true
                            return lot.upgrade >= s.upgradeMin && lot.upgrade <= s.upgradeMax
                          })
                          const minP = minActiveLotUnitPrice(filtered, lotEvalNowMs)
                          const threshold = parseDesiredBuyRub(draft)
                          const isDeal = threshold !== null && minP !== null && minP <= threshold
                          const upgOpen: AuctionHistoryUpgrade =
                            s.kind === 'artifact' &&
                            s.upgradeMin === s.upgradeMax &&
                            s.upgradeMin >= 1 &&
                            s.upgradeMin <= 15
                              ? (s.upgradeMin as AuctionHistoryUpgrade)
                              : 'all'

                          return (
                            <Stack
                              key={k}
                              gap={6}
                              p="md"
                              bd="1px solid var(--mantine-color-default-border)"
                              style={{
                                borderRadius: 8,
                                boxShadow: isDeal
                                  ? '0 0 14px 3px rgba(34, 197, 94, 0.38), 0 0 0 1px rgba(34, 197, 94, 0.22)'
                                  : undefined,
                                transition: 'box-shadow 220ms ease',
                              }}
                            >
                              <Group justify="space-between" align="center" wrap="nowrap">
                                <ItemBadge
                                  itemId={s.itemId}
                                  name={name}
                                  iconUrl={iconUrl}
                                  qualityColor={qualityColor}
                                  size="result"
                                  showFavoriteButton={false}
                                  openDetailsOnClick={false}
                                  onClick={() =>
                                    openAuctionHistoryItemModal(s.itemId, {
                                      initialQuality: s.quality,
                                      initialUpgrade: s.kind === 'artifact' ? upgOpen : 'all',
                                    })
                                  }
                                />
                                <ActionIcon
                                  size={36}
                                  color="red"
                                  variant="light"
                                  aria-label="Удалить подписку"
                                  title="Удалить подписку"
                                  onClick={async () => {
                                    setTrackedError(null)
                                    try {
                                      await removeSubscription(s)
                                    } catch (e) {
                                      setTrackedError(
                                        e instanceof Error ? e.message : 'Не удалось удалить подписку',
                                      )
                                    }
                                  }}
                                >
                                  ✕
                                </ActionIcon>
                              </Group>
                              <Text size="sm" fw={600}>
                                {title}
                              </Text>
                              <Group align="flex-end" wrap="nowrap" gap="xs">
                                <TextInput
                                  label="Желаемая стоимость скупа"
                                  placeholder="цена за единицу"
                                  value={draft}
                                  style={{ flex: 1 }}
                                  onChange={(event) => {
                                    const sanitized = event.currentTarget.value.replace(/[^\d]/g, '')
                                    setSubPriceDrafts((p) => ({ ...p, [k]: sanitized }))
                                  }}
                                />
                                <Button
                                  variant="default"
                                  color="gray"
                                  loading={savingSubKey === k}
                                  disabled={draft === (s.desiredBuyPrice ?? '')}
                                  onClick={async () => {
                                    setSavingSubKey(k)
                                    setTrackedError(null)
                                    try {
                                      await upsertSubscription({
                                        ...s,
                                        desiredBuyPrice: draft,
                                      })
                                    } catch (e) {
                                      setTrackedError(
                                        e instanceof Error ? e.message : 'Не удалось сохранить цену',
                                      )
                                    } finally {
                                      setSavingSubKey(null)
                                    }
                                  }}
                                >
                                  Сохранить
                                </Button>
                              </Group>
                            </Stack>
                          )
                        })}
                    </SimpleGrid>
                  ) : null}

                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                    {filteredMineRows.map((item) => {
                      const tk = classifyTrackingKind(item.dataPath, item.name)
                      const subsForItem = subscriptions.filter(
                        (s) =>
                          s.itemId === item.itemId &&
                          ((s.kind === 'core' && tk === 'core') || (s.kind === 'artifact' && tk === 'artifact')),
                      )
                      if ((tk === 'core' || tk === 'artifact') && subsForItem.length > 0) return null

                      const draft = priceDrafts[item.itemId] ?? desiredBuyByItemId[item.itemId] ?? ''
                      const threshold = parseDesiredBuyRub(draft)
                      const minP = minActiveLotUnitPrice(lotsByItemId[item.itemId] ?? [], lotEvalNowMs)
                      const isDeal = threshold !== null && minP !== null && minP <= threshold
                      const isShell = tk === 'core' || tk === 'artifact'

                      return (
                        <Stack
                          key={item.itemId}
                          gap={6}
                          p="md"
                          bd="1px solid var(--mantine-color-default-border)"
                          style={{
                            borderRadius: 8,
                            boxShadow: isDeal
                              ? '0 0 14px 3px rgba(34, 197, 94, 0.38), 0 0 0 1px rgba(34, 197, 94, 0.22)'
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
                              aria-label="Убрать из моих отслеживаний"
                              title="Убрать из моих отслеживаний"
                              loading={isRemovingItemId === item.itemId}
                              onClick={() => setPendingRemove({ scope: 'my', item })}
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
                          {isShell ? (
                            <Stack gap="xs">
                              <Text size="xs" c="dimmed">
                                Укажите редкость
                                {tk === 'artifact' ? ' и диапазон заточки' : ''} — отдельное уведомление для каждого
                                варианта.
                              </Text>
                              <Button
                                size="xs"
                                variant="light"
                                onClick={() =>
                                  openSubscriptionWizard({
                                    itemId: item.itemId,
                                    name: item.name,
                                    dataPath: item.dataPath,
                                    ensureTracked: false,
                                  })
                                }
                              >
                                Добавить вариант
                              </Button>
                            </Stack>
                          ) : null}
                          <Group align="flex-end" wrap="nowrap" gap="xs">
                            <TextInput
                              label={
                                isShell
                                  ? 'Скуп без варианта (все лоты)'
                                  : 'Желаемая стоимость скупа'
                              }
                              placeholder="цена за единицу"
                              value={draft}
                              style={{ flex: 1 }}
                              onChange={(event) => {
                                const sanitized = event.currentTarget.value.replace(/[^\d]/g, '')
                                setPriceDrafts((p) => ({ ...p, [item.itemId]: sanitized }))
                              }}
                            />
                            <Button
                              variant="default"
                              color="gray"
                              loading={savingPriceItemId === item.itemId}
                              disabled={draft === (desiredBuyByItemId[item.itemId] ?? '')}
                              onClick={async () => {
                                setSavingPriceItemId(item.itemId)
                                setTrackedError(null)
                                try {
                                  await saveDesiredBuyPrice(item.itemId, draft)
                                } catch (e) {
                                  setTrackedError(
                                    e instanceof Error ? e.message : 'Не удалось сохранить цену скупа',
                                  )
                                } finally {
                                  setSavingPriceItemId(null)
                                }
                              }}
                            >
                              Сохранить
                            </Button>
                          </Group>
                        </Stack>
                      )
                    })}
                  </SimpleGrid>
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="global" pt="md">
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                  {filteredGlobalRows.map((item) => {
                    const tk = classifyTrackingKind(item.dataPath, item.name)
                    return (
                      <Stack
                        key={`g-${item.itemId}`}
                        gap={8}
                        p="md"
                        bd="1px solid var(--mantine-color-default-border)"
                        style={{ borderRadius: 8 }}
                      >
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
                        <Group gap="xs" wrap="wrap">
                          {!mineSet.has(item.itemId) ? (
                            <Button
                              size="sm"
                              loading={isAddingItemId === item.itemId}
                              onClick={async () => {
                                if (tk === 'plain') {
                                  setIsAddingItemId(item.itemId)
                                  setTrackedError(null)
                                  try {
                                    await addTrackedAuctionItem(item.itemId)
                                    await reloadLists()
                                    useAuctionTrackedLotsStore.getState().bumpPoll()
                                  } catch (e) {
                                    setTrackedError(
                                      e instanceof Error ? e.message : 'Не удалось подписаться на предмет',
                                    )
                                  } finally {
                                    setIsAddingItemId(null)
                                  }
                                  return
                                }
                                openSubscriptionWizard({
                                  itemId: item.itemId,
                                  name: item.name,
                                  dataPath: item.dataPath,
                                  ensureTracked: true,
                                })
                              }}
                            >
                              Подписаться
                            </Button>
                          ) : (
                            <>
                              <Text size="sm" c="dimmed">
                                Уже в «Моих отслеживаниях»
                              </Text>
                              {(tk === 'core' || tk === 'artifact') && (
                                <Button
                                  size="sm"
                                  variant="light"
                                  onClick={() =>
                                    openSubscriptionWizard({
                                      itemId: item.itemId,
                                      name: item.name,
                                      dataPath: item.dataPath,
                                      ensureTracked: false,
                                    })
                                  }
                                >
                                  Вариант
                                </Button>
                              )}
                            </>
                          )}
                          {isAdmin ? (
                            <Button
                              size="sm"
                              color="red"
                              variant="light"
                              loading={isRemovingItemId === item.itemId}
                              onClick={() => setPendingRemove({ scope: 'global', item })}
                            >
                              Убрать для всех
                            </Button>
                          ) : null}
                        </Group>
                      </Stack>
                    )
                  })}
                </SimpleGrid>
              </Tabs.Panel>
            </Tabs>
          ) : null}
        </Stack>
      </SectionCard>

      <Modal
        opened={subscriptionWizard !== null}
        onClose={() => {
          if (!wizSaving) setSubscriptionWizard(null)
        }}
        title="Параметры отслеживания"
        centered
        size="md"
      >
        {subscriptionWizard ? (
          <Stack gap="sm">
            {wizError ? <Alert color="red">{wizError}</Alert> : null}
            <Text size="sm" c="dimmed">
              {subscriptionWizard.name} — {subscriptionWizard.trackKind === 'core' ? 'ядро модуля' : 'артефакт'}
            </Text>
            <Select
              label="Редкость"
              placeholder="Выберите"
              data={wizQualityOptions}
              value={wizQuality}
              onChange={(v) => setWizQuality((v as AuctionHistoryQuality | null) ?? null)}
              searchable
              clearable
            />
            {subscriptionWizard.trackKind === 'artifact' ? (
              <Group grow>
                <Select
                  label="Заточка от"
                  data={upgradeRangeOptions}
                  value={wizUpgMin}
                  onChange={(v) => setWizUpgMin(v ?? '0')}
                />
                <Select
                  label="до"
                  data={upgradeRangeOptions}
                  value={wizUpgMax}
                  onChange={(v) => setWizUpgMax(v ?? '15')}
                />
              </Group>
            ) : null}
            <TextInput
              label="Желаемая стоимость скупа"
              description="Необязательно: без цены уведомления о выгоде не приходят"
              placeholder="цена за единицу"
              value={wizPrice}
              onChange={(event) => setWizPrice(event.currentTarget.value.replace(/[^\d]/g, ''))}
            />
            <Group justify="flex-end">
              <Button
                variant="default"
                color="gray"
                onClick={() => setSubscriptionWizard(null)}
                disabled={wizSaving}
              >
                Отмена
              </Button>
              <Button
                loading={wizSaving}
                onClick={async () => {
                  if (!subscriptionWizard) return
                  if (!wizQuality) {
                    setWizError('Выберите редкость')
                    return
                  }
                  const priceDigits = wizPrice.replace(/[^\d]/g, '')
                  const minU = Number.parseInt(wizUpgMin, 10)
                  const maxU = Number.parseInt(wizUpgMax, 10)
                  if (subscriptionWizard.trackKind === 'artifact') {
                    if (
                      Number.isNaN(minU) ||
                      Number.isNaN(maxU) ||
                      minU < 0 ||
                      maxU > 15 ||
                      minU > maxU
                    ) {
                      setWizError('Диапазон заточки: от 0 до 15, минимум не больше максимума')
                      return
                    }
                  }
                  setWizError(null)
                  setWizSaving(true)
                  try {
                    if (subscriptionWizard.ensureTracked) {
                      await addTrackedAuctionItem(subscriptionWizard.itemId)
                      await reloadLists()
                      useAuctionTrackedLotsStore.getState().bumpPoll()
                    }
                    await upsertSubscription({
                      itemId: subscriptionWizard.itemId,
                      kind: subscriptionWizard.trackKind,
                      quality: wizQuality,
                      upgradeMin: subscriptionWizard.trackKind === 'artifact' ? minU : -1,
                      upgradeMax: subscriptionWizard.trackKind === 'artifact' ? maxU : -1,
                      desiredBuyPrice: priceDigits,
                    })
                    setSubscriptionWizard(null)
                  } catch (e) {
                    setWizError(e instanceof Error ? e.message : 'Не удалось сохранить')
                  } finally {
                    setWizSaving(false)
                  }
                }}
              >
                Сохранить
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

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
          <Text size="xs" c="dimmed">
            Если предмет уже есть во «Все отслеживания», он будет только добавлен в «Мои отслеживания». Для ядер и
            артефактов после выбора предмета откроется настройка редкости (и диапазона заточки для артефактов).
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
                  await reloadLists()
                  useAuctionTrackedLotsStore.getState().bumpPoll()
                  setManualItemName('')
                  const item = itemsById[resolvedItemId]
                  const nm = getItemName(item?.name?.lines) || resolvedItemId
                  const tk = classifyTrackingKind(item?.data, nm)
                  if (tk !== 'plain') {
                    openSubscriptionWizard({
                      itemId: resolvedItemId,
                      name: nm,
                      dataPath: item?.data,
                      ensureTracked: false,
                    })
                  }
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
                    disabled={isModalPrimaryDisabled(item)}
                    loading={isAddingItemId === item.itemId}
                    style={{ minWidth: 112, whiteSpace: 'nowrap', flexShrink: 0 }}
                    onClick={async () => {
                      const tk = classifyTrackingKind(item.dataPath, item.name)
                      if (!mineSet.has(item.itemId)) {
                        if (tk === 'plain') {
                          setIsAddingItemId(item.itemId)
                          setTrackedError(null)
                          try {
                            await addTrackedAuctionItem(item.itemId)
                            await reloadLists()
                            useAuctionTrackedLotsStore.getState().bumpPoll()
                          } catch (e) {
                            setTrackedError(
                              e instanceof Error ? e.message : 'Не удалось добавить предмет в отслеживание',
                            )
                          } finally {
                            setIsAddingItemId(null)
                          }
                          return
                        }
                        openSubscriptionWizard({
                          itemId: item.itemId,
                          name: item.name,
                          dataPath: item.dataPath,
                          ensureTracked: true,
                        })
                        return
                      }
                      if (tk === 'core' || tk === 'artifact') {
                        openSubscriptionWizard({
                          itemId: item.itemId,
                          name: item.name,
                          dataPath: item.dataPath,
                          ensureTracked: false,
                        })
                      }
                    }}
                  >
                    {getModalButtonLabel(item)}
                  </Button>
                </Group>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </Modal>

      <Modal
        opened={pendingRemove !== null}
        onClose={() => {
          if (!isRemovingItemId) setPendingRemove(null)
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
            {pendingRemove?.scope === 'global' ? 'Удалить для всех?' : 'Подтверждение удаления'}
          </Text>
          <Text size="sm">
            {pendingRemove?.scope === 'global'
              ? `Убрать «${pendingRemove?.item.name ?? pendingRemove?.item.itemId ?? ''}» из общего списка? Предмет перестанет собираться кроном, подписки пользователей будут сняты.`
              : `Убрать «${pendingRemove?.item.name ?? pendingRemove?.item.itemId ?? ''}» только из ваших отслеживаний? В общем списке предмет останется, можно снова подписаться.`}
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              color="gray"
              disabled={Boolean(isRemovingItemId)}
              onClick={() => setPendingRemove(null)}
            >
              Отмена
            </Button>
            <Button
              color="red"
              loading={Boolean(isRemovingItemId)}
              onClick={async () => {
                if (!pendingRemove) return
                setIsRemovingItemId(pendingRemove.item.itemId)
                setTrackedError(null)
                try {
                  await removeTrackedAuctionItem(
                    pendingRemove.item.itemId,
                    pendingRemove.scope === 'global' ? 'global' : 'my',
                  )
                  await reloadLists()
                  void useAuctionDesiredBuyPricesStore.getState().loadRemote()
                  void loadSubscriptions()
                  useAuctionTrackedLotsStore.getState().bumpPoll()
                  setPendingRemove(null)
                } catch (e) {
                  setTrackedError(
                    e instanceof Error ? e.message : 'Не удалось выполнить удаление',
                  )
                } finally {
                  setIsRemovingItemId(null)
                }
              }}
            >
              {pendingRemove?.scope === 'global' ? 'Убрать для всех' : 'Убрать из моих'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageContainer>
  )
}
