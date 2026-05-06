import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
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
} from '../../shared/api/backendApi'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { authModalGlowModalStyles } from '../../shared/lib/authModalGlowStyles'
import { useAuctionHistoryItemModalStore } from '../../shared/store/auctionHistoryItemModalStore'
import { minActiveLotUnitPrice } from '../../shared/lib/auctionActiveLotsUtils'
import { parseDesiredBuyRub } from '../../shared/lib/parseDesiredBuyRub'
import { useAuctionDesiredBuyPricesStore } from '../../shared/store/auctionDesiredBuyPricesStore'
import { useAuctionTrackedLotsStore } from '../../shared/store/auctionTrackedLotsStore'
import { useAuthStore } from '../../shared/store/authStore'
import { useAuctionTrackedItemRulesStore } from '../../shared/store/auctionTrackedItemRulesStore'
import { isArtifactDataPath, isModuleCoreItem } from '../../shared/lib/itemKinds'

import type { AuctionHistoryQuality } from '../../shared/api/backendApi'

type TrackedRow = {
  itemId: string
  name: string
  iconUrl?: string
  qualityColor?: string
  dataPath?: string
}

function pickQualityColor(rawColor: string | undefined, statusState: string | undefined): string | undefined {
  const c = (rawColor ?? '').trim()
  const s = (statusState ?? '').trim()
  // Some listing sources provide a text color (often pure white) instead of a rarity key.
  // When we have a status.state (NORMAL/UNCOMMON/.../LEGENDARY/UNIQUE), prefer it over a plain white/default value.
  if (
    s &&
    (c === '' || c.toLowerCase() === '#ffffff' || c.toUpperCase() === 'DEFAULT' || c.toUpperCase() === 'NORMAL')
  ) {
    return s
  }
  return c || s || undefined
}

export function AuctionHistoryPage() {
  const { itemsById, realm, isLoading, error, fetchRecipes } = useHideoutStore()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const desiredBuyByItemId = useAuctionDesiredBuyPricesStore((s) => s.desiredBuyByItemId)
  const saveDesiredBuyPrice = useAuctionDesiredBuyPricesStore((s) => s.saveDesiredBuyPrice)
  const rulesByItemId = useAuctionTrackedItemRulesStore((s) => s.rulesByItemId)
  const saveRules = useAuctionTrackedItemRulesStore((s) => s.saveRules)

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
  const [ruleEditOpened, setRuleEditOpened] = useState(false)
  const [ruleEditItemId, setRuleEditItemId] = useState<string | null>(null)
  const [ruleEditQualities, setRuleEditQualities] = useState<string[]>([])
  const [ruleEditUpgrades, setRuleEditUpgrades] = useState<number[]>([])
  const [ruleEditError, setRuleEditError] = useState<string | null>(null)
  const [isSavingRules, setIsSavingRules] = useState(false)

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
  }, [reloadLists])

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

  const mineSet = useMemo(() => new Set(mineIds), [mineIds])
  const globalSet = useMemo(() => new Set(globalIds), [globalIds])

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

  const openRulesEditor = (item: TrackedRow) => {
    const rule = rulesByItemId[item.itemId]
    setRuleEditError(null)
    setRuleEditItemId(item.itemId)
    setRuleEditOpened(true)
    setRuleEditQualities(rule?.qualities ?? [])
    setRuleEditUpgrades(rule?.upgrades ?? [])
  }

  const itemKind = useMemo(() => {
    if (!ruleEditItemId) return null
    const it = itemsById[ruleEditItemId]
    if (!it) return null
    const name = getItemName(it.name?.lines) || ruleEditItemId
    if (isArtifactDataPath(it.data)) return 'artifact'
    if (isModuleCoreItem(it.data, name)) return 'core'
    return null
  }, [itemsById, ruleEditItemId])

  const QUALITY_OPTIONS_CORE: Array<{ value: AuctionHistoryQuality; label: string }> = [
    { value: 'normal', label: 'Обычная' },
    { value: 'uncommon', label: 'Необычная' },
    { value: 'special', label: 'Особая' },
    { value: 'rare', label: 'Редкая' },
    { value: 'exclusive', label: 'Исключительная' },
    { value: 'legendary', label: 'Легендарная' },
  ]
  const QUALITY_OPTIONS_ARTIFACT: Array<{ value: AuctionHistoryQuality; label: string }> = [
    ...QUALITY_OPTIONS_CORE,
    { value: 'unique', label: 'Уникальная' },
  ]
  const qualityOptions = itemKind === 'artifact' ? QUALITY_OPTIONS_ARTIFACT : QUALITY_OPTIONS_CORE
  const upgradeOptions = useMemo(
    () => Array.from({ length: 16 }, (_, i) => ({ value: String(i), label: `+${i}` })),
    [],
  )

  const qualityLabelRu: Record<string, string> = {
    normal: 'Обычная',
    uncommon: 'Необычная',
    special: 'Особая',
    rare: 'Редкая',
    exclusive: 'Исключительная',
    legendary: 'Легендарная',
    unique: 'Уникальная',
  }

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
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [itemsById, realm])

  const filteredModalItems = useMemo(() => {
    const query = modalSearch.trim().toLowerCase()
    if (!query) return allItems
    return allItems.filter((item) => `${item.name} ${item.itemId}`.toLowerCase().includes(query))
  }, [allItems, modalSearch])

  const getModalButtonLabel = (itemId: string) => {
    if (mineSet.has(itemId)) return 'В моих'
    if (globalSet.has(itemId)) return 'Подписаться'
    return 'Добавить'
  }

  const isModalAddDisabled = (itemId: string) => mineSet.has(itemId)

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
          {isLoading || isLoadingLists ? <Loader size="sm" /> : null}
          {error ? <Alert color="red">{error}</Alert> : null}

          {!isLoading && !isLoadingLists ? (
            <Tabs value={activeTab} onChange={(v) => setActiveTab(v ?? 'mine')}>
              <Tabs.List>
                <Tabs.Tab value="mine">Мои отслеживания</Tabs.Tab>
                <Tabs.Tab value="global">Все отслеживания</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="mine" pt="md">
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                  {filteredMineRows.map((item) => {
                    const draft = priceDrafts[item.itemId] ?? desiredBuyByItemId[item.itemId] ?? ''
                    const threshold = parseDesiredBuyRub(draft)
                    const minP = minActiveLotUnitPrice(lotsByItemId[item.itemId] ?? [], lotEvalNowMs)
                    const isDeal = threshold !== null && minP !== null && minP <= threshold
                    const isArtifact = isArtifactDataPath(item.dataPath)
                    const isCore = isModuleCoreItem(item.dataPath, item.name)
                    const rule = rulesByItemId[item.itemId]
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
                        {isArtifact || isCore ? (
                          <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                            <Stack gap={2} style={{ flex: 1, minWidth: 180 }}>
                              <Text size="xs" c="dimmed">
                                {rule && rule.qualities.length > 0
                                  ? `Подписка: ${rule.qualities.map((q) => qualityLabelRu[q] ?? q).join(', ')}${
                                      isArtifact && rule.upgrades.length > 0
                                        ? `; заточка: ${rule.upgrades.map((u) => `+${u}`).join(', ')}`
                                        : ''
                                    }`
                                  : 'Подписка: все редкости'}
                              </Text>
                              {isCore && rule && rule.qualities.length > 0 ? (
                                <Group gap={6} wrap="wrap">
                                  {rule.qualities.map((q) => (
                                    <Button
                                      key={`${item.itemId}-q-${q}`}
                                      size="compact-xs"
                                      variant="subtle"
                                      color="gray"
                                      onClick={() =>
                                        openAuctionHistoryItemModal(item.itemId, {
                                          initialQuality: q as AuctionHistoryQuality,
                                        })
                                      }
                                    >
                                      {qualityLabelRu[q] ?? q}
                                    </Button>
                                  ))}
                                </Group>
                              ) : null}
                            </Stack>
                            <Button size="xs" variant="light" color="gray" onClick={() => openRulesEditor(item)}>
                              Условия
                            </Button>
                          </Group>
                        ) : null}
                        <Group align="flex-end" wrap="nowrap" gap="xs">
                          <TextInput
                            label="Желаемая стоимость скупа"
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
              </Tabs.Panel>

              <Tabs.Panel value="global" pt="md">
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                  {filteredGlobalRows.map((item) => (
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
                            }}
                          >
                            Подписаться
                          </Button>
                        ) : (
                          <Text size="sm" c="dimmed">
                            Уже в «Моих отслеживаниях»
                          </Text>
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
                  ))}
                </SimpleGrid>
              </Tabs.Panel>
            </Tabs>
          ) : null}
        </Stack>
      </SectionCard>

      <Modal opened={ruleEditOpened} onClose={() => setRuleEditOpened(false)} title="Условия подписки" centered>
        <Stack gap="sm">
          {ruleEditError ? <Alert color="red">{ruleEditError}</Alert> : null}
          <Text size="sm" c="dimmed">
            {itemKind === 'artifact'
              ? 'Выберите редкости и уровни заточки (+0…+15). Монитор и подсветка будут учитывать только подходящие лоты.'
              : itemKind === 'core'
                ? 'Выберите редкости. Монитор и подсветка будут учитывать только подходящие лоты.'
                : 'Этот предмет не распознан как артефакт или ядро модуля.'}
          </Text>

          <MultiSelect
            label="Редкости"
            data={qualityOptions.map((o) => ({ value: o.value, label: o.label }))}
            value={ruleEditQualities}
            onChange={(v) => setRuleEditQualities(v)}
            searchable
            clearable
            nothingFoundMessage="Нет вариантов"
          />

          {itemKind === 'artifact' ? (
            <MultiSelect
              label="Заточка"
              data={upgradeOptions}
              value={ruleEditUpgrades.map(String)}
              onChange={(v) =>
                setRuleEditUpgrades(
                  v.map((x) => Number.parseInt(x, 10)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 15),
                )
              }
              searchable
              clearable
              nothingFoundMessage="Нет вариантов"
            />
          ) : null}

          <Group justify="space-between">
            <Button
              variant="default"
              color="gray"
              onClick={() => {
                setRuleEditQualities([])
                setRuleEditUpgrades([])
              }}
            >
              Сбросить
            </Button>
            <Button
              loading={isSavingRules}
              disabled={!ruleEditItemId || itemKind === null}
              onClick={async () => {
                if (!ruleEditItemId) return
                setRuleEditError(null)
                setIsSavingRules(true)
                try {
                  const upgradesPayload =
                    itemKind === 'artifact' ? ruleEditUpgrades : ([null] as Array<number | null>)
                  await saveRules(ruleEditItemId, ruleEditQualities, upgradesPayload)
                  setRuleEditOpened(false)
                } catch (e) {
                  setRuleEditError(e instanceof Error ? e.message : 'Не удалось сохранить условия')
                } finally {
                  setIsSavingRules(false)
                }
              }}
            >
              Сохранить
            </Button>
          </Group>
        </Stack>
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
            Если предмет уже есть во «Все отслеживания», он будет только добавлен в «Мои отслеживания».
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
                    disabled={isModalAddDisabled(item.itemId)}
                    loading={isAddingItemId === item.itemId}
                    style={{ minWidth: 112, whiteSpace: 'nowrap', flexShrink: 0 }}
                    onClick={async () => {
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
                    }}
                  >
                    {getModalButtonLabel(item.itemId)}
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
