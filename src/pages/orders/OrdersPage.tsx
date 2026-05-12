import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import type { HideoutRecipe } from '../../entities/hideout/types'
import type { ListingItemWithId } from '../../entities/item/types'
import type { Realm } from '../../shared/config/app'
import { useAuthStore } from '../../shared/store/authStore'
import { useIngredientPricesStore } from '../../shared/store/ingredientPricesStore'
import { useRecipeOverridesStore } from '../../shared/store/recipeOverridesStore'
import { applyRecipeResultOverride } from '../../shared/lib/applyRecipeResultOverride'
import { mergeUserAndDefaultBuyPrices } from '../../shared/lib/craftCostBuyPrices'
import { buildCraftCostModel } from '../../shared/lib/costModel'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'
import { getRecipeFavoriteId } from '../../shared/lib/getRecipeFavoriteId'
import { getRecipeRequiredSkill } from '../../shared/lib/craftSkills'
import { pickListingItemQualityColor } from '../../shared/lib/itemQualityColor'
import { rollupOrderBaseIngredientsToBuy } from '../../shared/lib/orderBaseIngredientRollup'
import { sortOrderLines } from '../../shared/lib/orderIngredientRollup'
import { computeOrderLineTotalRub } from '../../shared/lib/orderLineBuyCraftCost'
import type { CraftOrder, OrderLine } from '../../shared/store/ordersStore'
import { useOrdersStore } from '../../shared/store/ordersStore'

const BRANCH_BY_PERK: Record<string, string> = {
  ammunition: 'Боеприпасы',
  pyrotechnics: 'Пиротехника',
  armorer: 'Защитное снаряжение',
  engineering: 'Инженерия',
  cooking: 'Кулинария',
  brewing: 'Самогоноварение',
  medicine: 'Медицина',
  materials: 'Сырье и материалы',
}

function resolveRecipeBranch(recipe: HideoutRecipe): string | null {
  const required = getRecipeRequiredSkill(recipe)
  if (!required) return null
  return BRANCH_BY_PERK[required.perkId] ?? null
}

function IconCheck(props: { size?: number }) {
  const s = props.size ?? 18
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconPlus(props: { size?: number }) {
  const s = props.size ?? 18
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconCross(props: { size?: number }) {
  const s = props.size ?? 18
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconPencil(props: { size?: number }) {
  const s = props.size ?? 16
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconTrash(props: { size?: number }) {
  const s = props.size ?? 16
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function useOrderDeadlineRemaining(deadlineHours: number | null, deadlineSetAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadlineHours === null || deadlineHours <= 0 || deadlineSetAt === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [deadlineHours, deadlineSetAt])

  if (deadlineHours === null || deadlineHours <= 0 || deadlineSetAt === null) return null
  const end = deadlineSetAt + deadlineHours * 3600000
  return end - now
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Истёк'
  const sec = Math.floor(ms / 1000)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h}ч ${String(m).padStart(2, '0')}м ${String(s).padStart(2, '0')}с`
}

type OrderCardProps = {
  order: CraftOrder
  itemsById: Record<string, ListingItemWithId>
  realm: Realm
  recipeByFavoriteId: Map<string, HideoutRecipe>
  costModel: ReturnType<typeof buildCraftCostModel>
  buyPricesMerged: Record<string, string>
  energyPrice: string
  pickableRecipes: HideoutRecipe[]
}

function OrderCard({
  order,
  itemsById,
  realm,
  recipeByFavoriteId,
  costModel,
  buyPricesMerged,
  energyPrice,
  pickableRecipes,
}: OrderCardProps) {
  const updateTitle = useOrdersStore((s) => s.updateTitle)
  const removeOrder = useOrdersStore((s) => s.removeOrder)
  const setDeadlineHours = useOrdersStore((s) => s.setDeadlineHours)
  const addLine = useOrdersStore((s) => s.addLine)
  const updateLineQuantity = useOrdersStore((s) => s.updateLineQuantity)
  const removeLine = useOrdersStore((s) => s.removeLine)
  const toggleLineDone = useOrdersStore((s) => s.toggleLineDone)
  const toggleIngredientDone = useOrdersStore((s) => s.toggleIngredientDone)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(order.title)
  const [pickOpen, setPickOpen] = useState(false)
  const [pickSearch, setPickSearch] = useState('')
  const [qtyModal, setQtyModal] = useState<null | { recipe: HideoutRecipe; favoriteId: string }>(null)
  const [qtyDraft, setQtyDraft] = useState(1)
  const [editQtyModal, setEditQtyModal] = useState<null | { line: OrderLine; recipe: HideoutRecipe }>(null)
  const [editQtyDraft, setEditQtyDraft] = useState(1)
  const [ingOpen, setIngOpen] = useState(false)
  const [hoursDraft, setHoursDraft] = useState<string>(order.deadlineHours !== null ? String(order.deadlineHours) : '')
  const remainingMs = useOrderDeadlineRemaining(order.deadlineHours, order.deadlineSetAt)

  useEffect(() => {
    if (!editingTitle) setTitleDraft(order.title)
  }, [order.title, editingTitle])

  useEffect(() => {
    setHoursDraft(order.deadlineHours !== null ? String(order.deadlineHours) : '')
  }, [order.deadlineHours, order.id])

  const filteredPick = useMemo(() => {
    const q = pickSearch.trim().toLowerCase()
    return pickableRecipes.filter((r) => {
      if (!q) return true
      const names = r.result
        .map((e) => `${e.item} ${getItemName(itemsById[e.item]?.name?.lines)}`.toLowerCase())
        .join(' ')
      return names.includes(q)
    })
  }, [pickableRecipes, pickSearch, itemsById])

  const sortedLines = useMemo(() => sortOrderLines(order.lines), [order.lines])

  const ingredientDoneMap = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const r of order.ingredientDone) {
      if (r.done) m.set(r.itemId, true)
    }
    return m
  }, [order.ingredientDone])

  const totalBuyCraft = useMemo(() => {
    let sum = 0
    let ok = true
    for (const line of order.lines) {
      const r = recipeByFavoriteId.get(line.recipeFavoriteId)
      if (!r) {
        ok = false
        continue
      }
      const v = computeOrderLineTotalRub(r, line.quantity, costModel, buyPricesMerged, energyPrice)
      if (v === null) ok = false
      else sum += v
    }
    return ok ? sum : null
  }, [order.lines, recipeByFavoriteId, costModel, buyPricesMerged, energyPrice])

  const buyRollup = useMemo(() => {
    const sorted = sortOrderLines(order.lines.filter((l) => !l.done))
    return rollupOrderBaseIngredientsToBuy(sorted, recipeByFavoriteId, costModel, buyPricesMerged)
  }, [order.lines, recipeByFavoriteId, costModel, buyPricesMerged])

  const rollupRows = useMemo(() => {
    return [...buyRollup.entries()]
      .filter(([, amt]) => amt > 1e-6)
      .map(([itemId, amount]) => ({
        itemId,
        amount,
        name: getItemName(itemsById[itemId]?.name?.lines) || itemId,
        iconUrl: itemsById[itemId] ? buildItemIconUrl(itemsById[itemId]!.icon, realm) : undefined,
        done: ingredientDoneMap.get(itemId) === true,
      }))
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        return a.name.localeCompare(b.name, 'ru')
      })
  }, [buyRollup, itemsById, realm, ingredientDoneMap])

  return (
    <>
      <Paper radius="md" withBorder p="sm" shadow="xs">
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              {editingTitle ? (
                <Group gap="xs" wrap="nowrap" align="center">
                  <TextInput
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.currentTarget.value)}
                    style={{ flex: 1 }}
                    size="sm"
                  />
                  <ActionIcon
                    variant="default"
                    size="sm"
                    aria-label="Подтвердить название"
                    title="Подтвердить"
                    onClick={() => {
                      void updateTitle(order.id, titleDraft.trim() || order.title).then(() => setEditingTitle(false))
                    }}
                  >
                    <IconCheck />
                  </ActionIcon>
                </Group>
              ) : (
                <Text
                  fw={700}
                  size="md"
                  style={{ cursor: 'pointer', lineHeight: 1.25 }}
                  onClick={() => {
                    setTitleDraft(order.title)
                    setEditingTitle(true)
                  }}
                >
                  {order.title}
                </Text>
              )}
              {remainingMs !== null ? (
                <Text size="xs" c={remainingMs <= 0 ? 'red' : 'dimmed'}>
                  До дедлайна: {formatRemaining(remainingMs)}
                </Text>
              ) : (
                <Text size="xs" c="dimmed">
                  Срок не задан
                </Text>
              )}
            </Stack>
            <ActionIcon variant="default" size="sm" aria-label="Удалить заказ" onClick={() => void removeOrder(order.id)}>
              <IconTrash />
            </ActionIcon>
          </Group>

          <Group align="flex-end" wrap="wrap" gap="xs">
            <NumberInput
              label="Часы на исполнение"
              placeholder="—"
              min={1}
              max={9999}
              size="xs"
              value={hoursDraft === '' ? undefined : Number(hoursDraft)}
              onChange={(v) => setHoursDraft(v === '' || v === undefined ? '' : String(v))}
              style={{ maxWidth: 160 }}
            />
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                const n = Number.parseInt(hoursDraft, 10)
                if (!Number.isFinite(n) || n <= 0) {
                  void setDeadlineHours(order.id, null).then(() => setHoursDraft(''))
                } else {
                  void setDeadlineHours(order.id, n)
                }
              }}
            >
              Сохранить срок
            </Button>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => {
                void setDeadlineHours(order.id, null).then(() => setHoursDraft(''))
              }}
            >
              Сбросить
            </Button>
          </Group>

          <Group justify="space-between" align="center" gap="sm">
            <Text fw={600} size="sm">
              Позиции
            </Text>
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                setPickSearch('')
                setPickOpen(true)
              }}
            >
              Добавить
            </Button>
          </Group>

          <Stack gap={6}>
            {sortedLines.length === 0 ? (
              <Text size="sm" c="dimmed">
                Пока нет позиций.
              </Text>
            ) : (
              sortedLines.map((line) => {
                const recipe = recipeByFavoriteId.get(line.recipeFavoriteId)
                const primaryId = recipe?.result[0]?.item
                const primaryName = primaryId
                  ? getItemName(itemsById[primaryId]?.name?.lines) || primaryId
                  : '—'
                const iconUrl =
                  primaryId && itemsById[primaryId] ? buildItemIconUrl(itemsById[primaryId]!.icon, realm) : undefined
                const lineTotal =
                  recipe &&
                  computeOrderLineTotalRub(recipe, line.quantity, costModel, buyPricesMerged, energyPrice)

                return (
                  <Group
                    key={line.id}
                    wrap="nowrap"
                    align="center"
                    gap="xs"
                    py={6}
                    px={8}
                    bd="1px solid var(--mantine-color-default-border)"
                    style={{ borderRadius: 8, opacity: line.done ? 0.48 : 1 }}
                  >
                    <ActionIcon
                      variant={line.done ? 'filled' : 'default'}
                      size="sm"
                      color="gray"
                      aria-label={line.done ? 'Вернуть в нужные' : 'Отметить готовым'}
                      title={line.done ? 'Вернуть в нужные' : 'Готово'}
                      onClick={() => void toggleLineDone(order.id, line.id, !line.done)}
                    >
                      {line.done ? <IconCross /> : <IconCheck />}
                    </ActionIcon>
                    <ItemBadge
                      itemId={primaryId}
                      name={`${primaryName} ×${line.quantity}`}
                      iconUrl={iconUrl}
                      qualityColor={pickListingItemQualityColor(primaryId ? itemsById[primaryId] : undefined)}
                      size="ingredient"
                      showFavoriteButton={false}
                    />
                    <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 0 }} lineClamp={1}>
                      {recipe ? resolveRecipeBranch(recipe) ?? recipe.bench : 'Рецепт не найден'}
                    </Text>
                    <Text size="xs" fw={600} style={{ whiteSpace: 'nowrap' }}>
                      {lineTotal !== null && lineTotal !== undefined ? `${formatAuctionRub(lineTotal)} ₽` : '—'}
                    </Text>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label="Изменить количество"
                      disabled={!recipe}
                      onClick={() => {
                        if (!recipe) return
                        setEditQtyDraft(line.quantity)
                        setEditQtyModal({ line, recipe })
                      }}
                    >
                      <IconPencil />
                    </ActionIcon>
                    <ActionIcon variant="subtle" size="sm" aria-label="Удалить позицию" onClick={() => void removeLine(order.id, line.id)}>
                      <IconTrash />
                    </ActionIcon>
                  </Group>
                )
              })
            )}
          </Stack>

          <Divider label="Оценка" labelPosition="center" my={4} />
          <Group justify="space-between" wrap="nowrap" gap="md">
            <Text size="sm" c="dimmed">
              Скуп и крафт
            </Text>
            <Text size="sm" fw={600}>
              {totalBuyCraft !== null ? `${formatAuctionRub(totalBuyCraft)} ₽` : '—'}
            </Text>
          </Group>

          <Button variant="subtle" size="xs" px={0} onClick={() => setIngOpen((o) => !o)}>
            {ingOpen ? 'Скрыть ингредиенты' : 'Ингредиенты'}
          </Button>
          {ingOpen ? (
            <Stack gap={6}>
              {rollupRows.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Нет данных — добавьте позиции или задайте цены ингредиентов.
                </Text>
              ) : (
                rollupRows.map((row) => (
                  <Group
                    key={row.itemId}
                    justify="space-between"
                    wrap="nowrap"
                    gap="sm"
                    align="center"
                    style={{ opacity: row.done ? 0.48 : 1 }}
                  >
                    <ActionIcon
                      variant={row.done ? 'filled' : 'default'}
                      size="sm"
                      color="gray"
                      aria-label={row.done ? 'Снять отметку' : 'Уже добыто'}
                      title={row.done ? 'Снять отметку' : 'Уже добыто'}
                      onClick={() => void toggleIngredientDone(order.id, row.itemId, !row.done)}
                    >
                      {row.done ? <IconCross /> : <IconCheck />}
                    </ActionIcon>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <ItemBadge
                        itemId={row.itemId}
                        name={row.name}
                        iconUrl={row.iconUrl}
                        qualityColor={pickListingItemQualityColor(itemsById[row.itemId])}
                        size="ingredient"
                        showFavoriteButton={false}
                      />
                    </Box>
                    <Text size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>
                      ×{new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(row.amount)}
                    </Text>
                  </Group>
                ))
              )}
            </Stack>
          ) : null}
        </Stack>
      </Paper>

      <Modal opened={pickOpen} onClose={() => setPickOpen(false)} title="Добавить крафт в заказ" size="lg" centered>
        <Stack gap="sm">
          <TextInput
            placeholder="Поиск по названию результата..."
            value={pickSearch}
            onChange={(e) => setPickSearch(e.currentTarget.value)}
          />
          <ScrollArea.Autosize mah={420}>
            <Stack gap={4}>
              {filteredPick.map((recipe) => {
                const pid = recipe.result[0]?.item
                const nm = pid ? getItemName(itemsById[pid]?.name?.lines) || pid : '—'
                const iu = pid && itemsById[pid] ? buildItemIconUrl(itemsById[pid]!.icon, realm) : undefined
                const br = resolveRecipeBranch(recipe)
                return (
                  <Group
                    key={getRecipeFavoriteId(recipe)}
                    justify="space-between"
                    wrap="nowrap"
                    p="xs"
                    bd="1px solid var(--mantine-color-default-border)"
                    style={{ borderRadius: 8 }}
                  >
                    <ItemBadge
                      itemId={pid}
                      name={nm}
                      iconUrl={iu}
                      qualityColor={pickListingItemQualityColor(pid ? itemsById[pid] : undefined)}
                      size="ingredient"
                      showFavoriteButton={false}
                    />
                    <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 0 }} lineClamp={1}>
                      {br ?? recipe.bench}
                    </Text>
                    <ActionIcon
                      variant="default"
                      size="sm"
                      aria-label="Добавить в заказ"
                      onClick={() => {
                        setQtyDraft(1)
                        setQtyModal({ recipe, favoriteId: getRecipeFavoriteId(recipe) })
                      }}
                    >
                      <IconPlus />
                    </ActionIcon>
                  </Group>
                )
              })}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </Modal>

      <Modal opened={qtyModal !== null} onClose={() => setQtyModal(null)} title="Количество" centered size="xs">
        {qtyModal ? (
          <Stack gap="sm">
            <NumberInput
              label="Предметов (основной результат)"
              min={1}
              value={qtyDraft}
              onChange={(v) => setQtyDraft(typeof v === 'number' ? v : 1)}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setQtyModal(null)}>
                Отмена
              </Button>
              <Button
                onClick={() => {
                  void addLine(order.id, qtyModal.favoriteId, qtyDraft).then(() => {
                    setQtyModal(null)
                    setPickOpen(false)
                  })
                }}
              >
                Добавить
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <Modal opened={editQtyModal !== null} onClose={() => setEditQtyModal(null)} title="Количество" centered size="xs">
        {editQtyModal ? (
          <Stack gap="sm">
            <NumberInput
              label="Предметов"
              min={1}
              value={editQtyDraft}
              onChange={(v) => setEditQtyDraft(typeof v === 'number' ? v : 1)}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEditQtyModal(null)}>
                Отмена
              </Button>
              <Button
                onClick={() => {
                  void updateLineQuantity(order.id, editQtyModal.line.id, editQtyDraft).then(() =>
                    setEditQtyModal(null),
                  )
                }}
              >
                Сохранить
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </>
  )
}

export function OrdersPage() {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const userId = user?.id
  const { recipes, itemsById, realm, isLoading, error, fetchRecipes } = useHideoutStore()
  const craftBranchLevels = useAuthStore((s) => s.user?.craftBranchLevels ?? null)
  const recipeOverridesById = useRecipeOverridesStore((s) => s.byRecipeId)
  const loadOverrides = useRecipeOverridesStore((s) => s.loadOverrides)
  const buyPricesByItemId = useIngredientPricesStore((s) => s.buyPricesByItemId)
  const defaultBuyPricesByItemId = useIngredientPricesStore((s) => s.defaultBuyPricesByItemId)
  const energyPrice = useIngredientPricesStore((s) => s.energyPrice)
  const loadRemoteBuyPrices = useIngredientPricesStore((s) => s.loadRemoteBuyPrices)

  const orders = useOrdersStore((s) => s.orders)
  const ordersLoading = useOrdersStore((s) => s.isLoading)
  const ordersError = useOrdersStore((s) => s.error)
  const migrationsPending = useOrdersStore((s) => s.migrationsPending)
  const loadRemoteOrders = useOrdersStore((s) => s.loadRemote)
  const createOrder = useOrdersStore((s) => s.createOrder)

  useEffect(() => {
    if (!userId || !token) return
    void loadRemoteOrders()
  }, [userId, token, loadRemoteOrders])

  useEffect(() => {
    void fetchRecipes()
  }, [fetchRecipes])
  useEffect(() => {
    void loadOverrides()
  }, [loadOverrides])
  useEffect(() => {
    void loadRemoteBuyPrices()
  }, [loadRemoteBuyPrices])

  const adjustedRecipes = useMemo(
    () => recipes.map((r) => applyRecipeResultOverride(r, recipeOverridesById, craftBranchLevels)),
    [recipes, recipeOverridesById, craftBranchLevels],
  )

  const recipeByFavoriteId = useMemo(() => {
    const m = new Map<string, HideoutRecipe>()
    for (const r of adjustedRecipes) {
      m.set(getRecipeFavoriteId(r), r)
    }
    return m
  }, [adjustedRecipes])

  const pickableRecipes = useMemo(() => {
    return [...adjustedRecipes]
      .filter((r) => resolveRecipeBranch(r) !== null)
      .sort((a, b) => {
        const na = getItemName(itemsById[a.result[0]?.item]?.name?.lines) || ''
        const nb = getItemName(itemsById[b.result[0]?.item]?.name?.lines) || ''
        return na.localeCompare(nb, 'ru')
      })
  }, [adjustedRecipes, itemsById])

  const buyPricesMerged = useMemo(
    () => mergeUserAndDefaultBuyPrices(buyPricesByItemId, defaultBuyPricesByItemId),
    [buyPricesByItemId, defaultBuyPricesByItemId],
  )

  const costModel = useMemo(
    () => buildCraftCostModel(adjustedRecipes, buyPricesMerged, energyPrice),
    [adjustedRecipes, buyPricesMerged, energyPrice],
  )

  if (!userId) {
    return (
      <PageContainer>
        <Text size="sm">Нужна авторизация.</Text>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <SectionCard title="" description="">
        <Stack gap="md">
          <Group justify="space-between" align="center" wrap="wrap">
            <Text size="xl" fw={700}>
              Заказы
            </Text>
            <Button onClick={() => void createOrder()} disabled={migrationsPending}>
              Создать заказ
            </Button>
          </Group>

          {isLoading ? <Loader size="sm" /> : null}
          {error ? (
            <Text c="red" size="sm">
              {error}
            </Text>
          ) : null}

          {ordersLoading ? <Loader size="sm" /> : null}
          {ordersError ? (
            <Text c="red" size="sm">
              {ordersError}
            </Text>
          ) : null}
          {migrationsPending ? (
            <Alert color="yellow" title="Синхронизация заказов">
              На сервере ещё не применена миграция для заказов. Список заказов с других устройств появится после
              обновления базы.
            </Alert>
          ) : null}

          {!ordersLoading && !migrationsPending && orders.length === 0 ? (
            <Text size="sm" c="dimmed">
              Заказов пока нет. Нажмите «Создать заказ».
            </Text>
          ) : !migrationsPending && orders.length > 0 ? (
            <Stack gap="lg">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  itemsById={itemsById}
                  realm={realm}
                  recipeByFavoriteId={recipeByFavoriteId}
                  costModel={costModel}
                  buyPricesMerged={buyPricesMerged}
                  energyPrice={energyPrice}
                  pickableRecipes={pickableRecipes}
                />
              ))}
            </Stack>
          ) : null}
        </Stack>
      </SectionCard>
    </PageContainer>
  )
}
