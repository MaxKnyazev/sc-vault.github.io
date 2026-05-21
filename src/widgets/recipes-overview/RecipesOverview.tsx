import {
  ActionIcon,
  Accordion,
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { useHideoutStore } from '../../entities/hideout/store'
import { AuctionRefreshStatus } from '../../components/auction-refresh-status/AuctionRefreshStatus'
import { SectionCard } from '../../components/section-card/SectionCard'
import { RecipeCard } from '../../components/recipe-card/RecipeCard'
import { collectHideoutItemIds } from '../../shared/lib/collectHideoutItemIds'
import { getRecipeFavoriteId } from '../../shared/lib/getRecipeFavoriteId'
import { getItemName } from '../../entities/item/lib'
import { useFavoritesStore } from '../../shared/store/favoritesStore'
import { useRecipeOverridesStore } from '../../shared/store/recipeOverridesStore'
import { applyRecipeResultOverride } from '../../shared/lib/applyRecipeResultOverride'
import type { HideoutRecipe } from '../../entities/hideout/types'
import { useAuthStore } from '../../shared/store/authStore'
import { getRecipeRequiredSkill } from '../../shared/lib/craftSkills'
import { useIngredientPricesStore } from '../../shared/store/ingredientPricesStore'
import { mergeUserAndDefaultBuyPrices } from '../../shared/lib/craftCostBuyPrices'
import { buildCraftCostModel } from '../../shared/lib/costModel'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'
import { recipeBatchOutputForPrimaryItem } from '../../shared/lib/recipeBatchOutput'
import { getDuplicateCraftDisplayLabel } from '../../shared/lib/craftDuplicateRecipeLabels'
import { buildInsufficientCostMessage } from '../../shared/lib/recipeCostLineDisplay'
import { appModalStyles } from '../../shared/theme/appModalStyles'
import {
  auctionHybridSettingsKey,
  fetchBackendHybridAuctionPrices,
  type HybridAuctionItemMetrics,
} from '../../shared/api/backendApi'
import { PageTitleWithHybridSettings } from '../../components/auction-hybrid-settings/PageTitleWithHybridSettings'
import { buildHybridAuctionAvgMap } from '../../shared/lib/hybridAuctionAvgMap'
import { auctionLiquidityShortLabel } from '../../shared/lib/auctionLiquidityValidity'
import { useAuctionLiquidityStore } from '../../shared/store/auctionLiquidityStore'

const CANON_BRANCHES = [
  'Боеприпасы',
  'Пиротехника',
  'Защитное снаряжение',
  'Инженерия',
  'Кулинария',
  'Самогоноварение',
  'Медицина',
  'Сырье и материалы',
] as const
type CanonBranch = (typeof CANON_BRANCHES)[number]

const BRANCH_BY_PERK: Record<string, CanonBranch> = {
  ammunition: 'Боеприпасы',
  pyrotechnics: 'Пиротехника',
  armorer: 'Защитное снаряжение',
  engineering: 'Инженерия',
  cooking: 'Кулинария',
  brewing: 'Самогоноварение',
  medicine: 'Медицина',
  materials: 'Сырье и материалы',
}

type IngredientFlowRow = {
  itemId: string
  amount: number
  craftRuns: number
  source: 'craft' | 'buy' | 'unknown'
  perUnitCost: number | null
  totalCost: number | null
  reasons: string[]
}

type IngredientLeftoverRow = {
  itemId: string
  amount: number
}

type RecipeOption = {
  recipe: HideoutRecipe
  outputAmount: number
  craftPerUnit: number | null
  missingIngredientIds: string[]
  hasEnergyGap: boolean
}

const ENERGY_ROW_ID = '__energy__'

function parsePositiveNumber(raw: string | null | undefined): number | null {
  if (!raw) return null
  const normalized = raw.replace(',', '.').trim()
  if (normalized === '') return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function resolveRecipeCanonBranch(
  recipe: HideoutRecipe,
): CanonBranch | null {
  const required = getRecipeRequiredSkill(recipe)
  if (!required) return null
  return BRANCH_BY_PERK[required.perkId] ?? null
}

export function RecipesOverview() {
  const { recipes, itemsById, realm, isLoading, error, fetchRecipes } = useHideoutStore()
  const favoriteCraftIds = useFavoritesStore((state) => state.favoriteCraftIds)
  const craftBranchLevels = useAuthStore((s) => s.user?.craftBranchLevels ?? null)
  const authToken = useAuthStore((s) => s.token)
  const hybridSettingsKey = useAuthStore((s) => auctionHybridSettingsKey(s.user?.auctionHybridSettings))
  const hybridSettingsMode = useAuthStore((s) => s.user?.auctionHybridSettings?.mode ?? 'last_sales')
  const recipeOverridesById = useRecipeOverridesStore((s) => s.byRecipeId)
  const loadOverrides = useRecipeOverridesStore((s) => s.loadOverrides)
  const buyPricesByItemId = useIngredientPricesStore((s) => s.buyPricesByItemId)
  const defaultBuyPricesByItemId = useIngredientPricesStore((s) => s.defaultBuyPricesByItemId)
  const energyPrice = useIngredientPricesStore((s) => s.energyPrice)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<'all' | 'favorites' | string>('all')
  const [costTreeItemId, setCostTreeItemId] = useState<string | null>(null)
  const [hybridAuctionByItemId, setHybridAuctionByItemId] = useState<Record<string, HybridAuctionItemMetrics>>({})
  const [hybridAuctionError, setHybridAuctionError] = useState<string | null>(null)
  const [hybridPartialBatchWarnings, setHybridPartialBatchWarnings] = useState<string[] | null>(null)

  useEffect(() => {
    void fetchRecipes()
  }, [fetchRecipes])

  useEffect(() => {
    void loadOverrides()
  }, [loadOverrides])

  const adjustedRecipes = useMemo(
    () => recipes.map((recipe) => applyRecipeResultOverride(recipe, recipeOverridesById, craftBranchLevels)),
    [recipes, recipeOverridesById, craftBranchLevels],
  )

  const usedInRecipesByItemId = useMemo(() => {
    const map = new Map<string, HideoutRecipe[]>()
    for (const parent of adjustedRecipes) {
      for (const ing of parent.ingredients) {
        const list = map.get(ing.item)
        if (list) list.push(parent)
        else map.set(ing.item, [parent])
      }
    }
    return map
  }, [adjustedRecipes])

  const allCategories = useMemo(() => {
    const set = new Set<CanonBranch>()
    for (const recipe of adjustedRecipes) {
      const branch = resolveRecipeCanonBranch(recipe)
      if (branch) set.add(branch)
    }
    return CANON_BRANCHES.filter((branch) => set.has(branch))
  }, [adjustedRecipes])

  const groupedRecipes = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase()

    const scoredRecipes = adjustedRecipes
      .map((recipe) => {
        let matchPriority: number | null = null
        const recipeFavoriteId = getRecipeFavoriteId(recipe)

        const dupTitle = getDuplicateCraftDisplayLabel(recipe)
        const resultNames = [
          ...recipe.result.map((entry) => {
            const item = itemsById[entry.item]
            return `${entry.item} ${getItemName(item?.name?.lines)}`.toLowerCase()
          }),
          dupTitle ? dupTitle.toLowerCase() : '',
        ]
          .filter(Boolean)
          .join(' ')

        if (!normalizedQuery) {
          matchPriority = 0
        } else if (resultNames.includes(normalizedQuery)) {
          matchPriority = 0
        }

        return { recipe, matchPriority, recipeFavoriteId }
      })
      .filter((entry) => entry.matchPriority !== null)

    const filtered = scoredRecipes.filter(({ recipe, recipeFavoriteId }) => {
      const categoryName = resolveRecipeCanonBranch(recipe)
      if (!categoryName) {
        return false
      }
      if (
        activeCategory !== 'all' &&
        activeCategory !== 'favorites' &&
        categoryName !== activeCategory
      ) {
        return false
      }

      if (activeCategory === 'favorites') {
        if (!favoriteCraftIds.includes(recipeFavoriteId)) return false
      }

      return true
    })

    return filtered.reduce<Record<string, typeof filtered>>((acc, entry) => {
      const { recipe, matchPriority } = entry
      const categoryName = resolveRecipeCanonBranch(recipe)
      if (!categoryName) return acc

      if (!acc[categoryName]) {
        acc[categoryName] = []
      }

      if (matchPriority === 0) {
        acc[categoryName].unshift(entry)
      } else {
        acc[categoryName].push(entry)
      }
      return acc
    }, {})
  }, [activeCategory, adjustedRecipes, favoriteCraftIds, itemsById, search])

  const categoryEntries = useMemo(() => Object.entries(groupedRecipes), [groupedRecipes])
  const defaultOpenedCategories = useMemo(
    () => categoryEntries.map(([category]) => category),
    [categoryEntries],
  )
  const auctionItemIds = useMemo(() => collectHideoutItemIds(recipes), [recipes])
  const buyPricesMerged = useMemo(
    () => mergeUserAndDefaultBuyPrices(buyPricesByItemId, defaultBuyPricesByItemId),
    [buyPricesByItemId, defaultBuyPricesByItemId],
  )

  useEffect(() => {
    if (!authToken || auctionItemIds.length === 0) {
      setHybridAuctionByItemId({})
      setHybridAuctionError(null)
      setHybridPartialBatchWarnings(null)
      return
    }
    let cancelled = false
    setHybridAuctionError(null)
    setHybridPartialBatchWarnings(null)
    void fetchBackendHybridAuctionPrices(auctionItemIds)
      .then((payload) => {
        if (cancelled) return
        setHybridAuctionByItemId(payload.items ?? {})
        setHybridPartialBatchWarnings(
          payload.partialErrors && payload.partialErrors.length > 0 ? payload.partialErrors : null,
        )
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setHybridAuctionByItemId({})
        setHybridPartialBatchWarnings(null)
        setHybridAuctionError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [authToken, auctionItemIds, hybridSettingsKey])

  const liquidityByItemId = useAuctionLiquidityStore((s) => s.byItemId)
  useEffect(() => {
    if (!authToken || auctionItemIds.length === 0) return
    void useAuctionLiquidityStore.getState().ensureForItems(auctionItemIds)
  }, [authToken, auctionItemIds])

  const hybridAvgUnitByItemId = useMemo(
    () => buildHybridAuctionAvgMap(hybridAuctionByItemId),
    [hybridAuctionByItemId],
  )

  const costModel = useMemo(
    () => buildCraftCostModel(adjustedRecipes, buyPricesMerged, energyPrice),
    [adjustedRecipes, buyPricesMerged, energyPrice],
  )
  const costModelHybrid = useMemo(
    () => buildCraftCostModel(adjustedRecipes, buyPricesMerged, energyPrice, hybridAvgUnitByItemId),
    [adjustedRecipes, buyPricesMerged, energyPrice, hybridAvgUnitByItemId],
  )

  const costTreeItemName = useMemo(() => {
    if (!costTreeItemId) return ''
    return getItemName(itemsById[costTreeItemId]?.name?.lines) || costTreeItemId
  }, [costTreeItemId, itemsById])

  const formatBatchAmount = (value: number): string => {
    const rounded = Math.round(value)
    if (Math.abs(value - rounded) < 1e-9) return new Intl.NumberFormat('ru-RU').format(rounded)
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(value.toFixed(3)))
  }

  const ingredientFlow = useMemo(() => {
    const EPS = 1e-9
    if (!costTreeItemId) {
      return {
        rootSource: 'unknown' as const,
        rootReasons: [] as string[],
        rootOutputAmount: null as number | null,
        rows: [] as IngredientFlowRow[],
        leftovers: [] as IngredientLeftoverRow[],
      }
    }
    const rowsByItemId = new Map<string, IngredientFlowRow>()
    const leftoversByItemId = new Map<string, number>()

    const getUnresolvedReasons = (itemId: string): string[] => {
      const meta = costModelHybrid.unresolvedMetaByItemId.get(itemId)
      if (!meta) return []
      const reasons: string[] = []
      if (meta.cycleUnanchored) reasons.push('цикл без ценового якоря')
      if (meta.unstableCycle) reasons.push('цикл не сошелся')
      if (meta.missingEnergy) reasons.push('нет цены энергии')
      if (meta.missingIngredientIds.length > 0) {
        reasons.push(
          `нет цен ингредиентов: ${meta.missingIngredientIds
            .map((id) => getItemName(itemsById[id]?.name?.lines) || id)
            .join(', ')}`,
        )
      }
      if (meta.noRecipes) reasons.push('нет крафтовых рецептов')
      if (meta.noBuy) reasons.push('нет базовой цены (скуп/аукцион)')
      return reasons
    }

    const normalizeAmount = (value: number): number => {
      if (Math.abs(value) < EPS) return 0
      const rounded = Math.round(value)
      return Math.abs(value - rounded) < EPS ? rounded : value
    }

    const resolveSource = (itemId: string): {
      source: IngredientFlowRow['source']
      bestRecipe: RecipeOption | null
      buyCost: number | null
      reasons: string[]
    } => {
      if (itemId === ENERGY_ROW_ID) {
        const energyUnitCost = parsePositiveNumber(energyPrice)
        if (energyUnitCost !== null) return { source: 'buy', bestRecipe: null, buyCost: energyUnitCost, reasons: [] }
        return { source: 'unknown', bestRecipe: null, buyCost: null, reasons: ['нет цены энергии'] }
      }
      const buyCost = parsePositiveNumber(buyPricesMerged[itemId] ?? null)
      const aucN = hybridAvgUnitByItemId.get(itemId)
      const leafCost =
        buyCost !== null && aucN !== undefined
          ? Math.min(buyCost, aucN)
          : buyCost ?? aucN ?? null
      const bestRecipe = costModelHybrid.bestRecipeOptionByItemId.get(itemId) ?? null
      const canCraft = bestRecipe?.craftPerUnit !== null
      if (
        canCraft &&
        (leafCost === null || (bestRecipe?.craftPerUnit ?? Number.POSITIVE_INFINITY) <= leafCost + 1e-9)
      ) {
        return { source: 'craft', bestRecipe, buyCost: leafCost, reasons: [] }
      }
      if (leafCost !== null) return { source: 'buy', bestRecipe, buyCost: leafCost, reasons: [] }
      return { source: 'unknown', bestRecipe, buyCost: leafCost, reasons: getUnresolvedReasons(itemId) }
    }

    const addRow = (
      itemId: string,
      amount: number,
      craftRuns: number,
      source: IngredientFlowRow['source'],
      perUnitCost: number | null,
      reasons: string[],
    ) => {
      const normalizedAmount = normalizeAmount(amount)
      if (normalizedAmount <= 0) return
      const normalizedRuns = normalizeAmount(craftRuns)
      const prev = rowsByItemId.get(itemId)
      if (!prev) {
        rowsByItemId.set(itemId, {
          itemId,
          amount: normalizedAmount,
          craftRuns: normalizedRuns,
          source,
          perUnitCost,
          totalCost: perUnitCost !== null ? normalizeAmount(perUnitCost * normalizedAmount) : null,
          reasons: [...new Set(reasons)],
        })
        return
      }
      const mergedSource: IngredientFlowRow['source'] = prev.source === source ? source : 'unknown'
      const mergedReasons = [...new Set([...prev.reasons, ...reasons])]
      const nextAmount = normalizeAmount(prev.amount + normalizedAmount)
      const nextPerUnit = prev.perUnitCost ?? perUnitCost
      rowsByItemId.set(itemId, {
        itemId,
        amount: nextAmount,
        craftRuns: normalizeAmount(prev.craftRuns + normalizedRuns),
        source: mergedSource,
        perUnitCost: nextPerUnit,
        totalCost: nextPerUnit !== null ? normalizeAmount(nextPerUnit * nextAmount) : null,
        reasons: mergedReasons,
      })
    }

    const addLeftover = (itemId: string, amount: number) => {
      if (itemId === ENERGY_ROW_ID) return
      const normalizedAmount = normalizeAmount(amount)
      if (normalizedAmount <= 0) return
      const prev = leftoversByItemId.get(itemId) ?? 0
      leftoversByItemId.set(itemId, normalizeAmount(prev + normalizedAmount))
    }

    const consumeLeftover = (itemId: string, neededAmount: number): number => {
      if (itemId === ENERGY_ROW_ID) return neededAmount
      const currentLeftover = leftoversByItemId.get(itemId) ?? 0
      if (currentLeftover <= 0) return neededAmount
      const take = Math.min(currentLeftover, neededAmount)
      const nextLeftover = normalizeAmount(currentLeftover - take)
      if (nextLeftover > 0) leftoversByItemId.set(itemId, nextLeftover)
      else leftoversByItemId.delete(itemId)
      return normalizeAmount(neededAmount - take)
    }

    const walkSelectedPath = (itemId: string, amountNeeded: number, path: string[]) => {
      let normalizedNeeded = normalizeAmount(amountNeeded)
      if (normalizedNeeded <= 0) return
      if (path.includes(itemId)) {
        const anchoredCycleCost = costModelHybrid.effectiveCostByItemId.get(itemId)
        if (anchoredCycleCost !== undefined && Number.isFinite(anchoredCycleCost)) {
          addRow(itemId, normalizedNeeded, 0, 'craft', anchoredCycleCost, [
            'обнаружен цикл в выбранной ветке',
            'цена взята из SCC-оценки (циклический крафт с ценовым якорем)',
          ])
        } else {
          addRow(itemId, normalizedNeeded, 0, 'unknown', null, [
            'обнаружен цикл в выбранной ветке',
            'нет ценового якоря для расчета цикла',
          ])
        }
        return
      }
      normalizedNeeded = consumeLeftover(itemId, normalizedNeeded)
      if (normalizedNeeded <= 0) return
      const resolved = resolveSource(itemId)
      if (
        resolved.source !== 'craft' ||
        !resolved.bestRecipe ||
        resolved.bestRecipe.craftPerUnit === null ||
        resolved.bestRecipe.outputAmount <= 0
      ) {
        addRow(itemId, normalizedNeeded, 0, resolved.source, resolved.source === 'buy' ? resolved.buyCost : null, resolved.reasons)
        return
      }
      const runs = Math.max(1, Math.ceil((normalizedNeeded - EPS) / resolved.bestRecipe.outputAmount))
      const producedAmount = normalizeAmount(runs * resolved.bestRecipe.outputAmount)
      const leftoverAmount = normalizeAmount(producedAmount - normalizedNeeded)
      addRow(itemId, normalizedNeeded, runs, 'craft', resolved.bestRecipe.craftPerUnit, [])
      if (resolved.bestRecipe.recipe.energy > 0) {
        walkSelectedPath(ENERGY_ROW_ID, normalizeAmount(resolved.bestRecipe.recipe.energy * runs), [...path, itemId])
      }
      if (leftoverAmount > 0) addLeftover(itemId, leftoverAmount)
      for (const ingredient of resolved.bestRecipe.recipe.ingredients) {
        walkSelectedPath(ingredient.item, normalizeAmount(ingredient.amount * runs), [...path, itemId])
      }
    }

    const rootResolved = resolveSource(costTreeItemId)
    const rootOutputAmount =
      rootResolved.source === 'craft' && rootResolved.bestRecipe
        ? normalizeAmount(rootResolved.bestRecipe.outputAmount)
        : null
    if (rootResolved.source === 'craft' && rootResolved.bestRecipe) {
      if (rootResolved.bestRecipe.recipe.energy > 0) {
        walkSelectedPath(ENERGY_ROW_ID, normalizeAmount(rootResolved.bestRecipe.recipe.energy), [costTreeItemId])
      }
      for (const ingredient of rootResolved.bestRecipe.recipe.ingredients) {
        walkSelectedPath(ingredient.item, normalizeAmount(ingredient.amount), [costTreeItemId])
      }
    }

    const rows = [...rowsByItemId.values()].sort((a, b) => {
      if (a.source !== b.source) {
        const order: Record<IngredientFlowRow['source'], number> = { craft: 0, buy: 1, unknown: 2 }
        return order[a.source] - order[b.source]
      }
      const aName = a.itemId === ENERGY_ROW_ID ? 'Энергия' : getItemName(itemsById[a.itemId]?.name?.lines) || a.itemId
      const bName = b.itemId === ENERGY_ROW_ID ? 'Энергия' : getItemName(itemsById[b.itemId]?.name?.lines) || b.itemId
      return aName.localeCompare(bName, 'ru')
    })
    const leftovers = [...leftoversByItemId.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([itemId, amount]) => ({ itemId, amount }))
      .sort((a, b) => {
        const aName = getItemName(itemsById[a.itemId]?.name?.lines) || a.itemId
        const bName = getItemName(itemsById[b.itemId]?.name?.lines) || b.itemId
        return aName.localeCompare(bName, 'ru')
      })
    return { rootSource: rootResolved.source, rootReasons: rootResolved.reasons, rootOutputAmount, rows, leftovers }
  }, [buyPricesMerged, costModelHybrid, costTreeItemId, energyPrice, hybridAvgUnitByItemId, itemsById])

  return (
    <SectionCard title="" description="">
      <Stack gap="xs">
        {isLoading ? (
          <Group gap="xs">
            <Loader size="sm" />
            <Text size="sm">Загрузка рецептов...</Text>
          </Group>
        ) : null}

        {error ? (
          <Alert color="red" title="Ошибка загрузки">
            {error}
          </Alert>
        ) : null}

        {!isLoading && !error ? (
          <>
            <PageTitleWithHybridSettings title="Крафты" />
            <AuctionRefreshStatus itemIds={auctionItemIds} />
            {hybridAuctionError ? (
              <Alert color="red" title="Гибридная оценка аукциона">
                {hybridAuctionError}
              </Alert>
            ) : null}
            {hybridPartialBatchWarnings?.length ? (
              <Alert color="yellow" title="Гибрид: часть запросов не удалась">
                <Stack gap={6}>
                  {hybridPartialBatchWarnings.map((w) => (
                    <Text key={w} size="sm">
                      {w}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            ) : null}
            <Group align="flex-end" wrap="wrap">
              <TextInput
                placeholder="Поиск по названию итогового предмета..."
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                style={{ flex: 1, minWidth: 280 }}
                rightSection={
                  search ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      onClick={() => setSearch('')}
                      aria-label="Очистить поиск"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </ActionIcon>
                  ) : null
                }
              />
            </Group>

            <Group justify="center" gap="xs" wrap="wrap" className="filter-chip-row">
              <Button
                variant={activeCategory === 'all' ? 'filled' : 'default'}
                onClick={() => setActiveCategory('all')}
                style={{
                  whiteSpace: 'normal',
                  height: 'auto',
                  textAlign: 'center',
                  fontSize: 15,
                  padding: '10px 16px',
                  borderRadius: 12,
                  lineHeight: 1.2,
                }}
              >
                Все
              </Button>
              <Button
                variant={activeCategory === 'favorites' ? 'filled' : 'default'}
                onClick={() => setActiveCategory('favorites')}
                style={{
                  whiteSpace: 'normal',
                  height: 'auto',
                  textAlign: 'center',
                  fontSize: 15,
                  padding: '10px 16px',
                  borderRadius: 12,
                  lineHeight: 1.2,
                }}
              >
                Избранное
              </Button>
              {allCategories.map((category) => (
                <Button
                  key={category}
                  variant={activeCategory === category ? 'filled' : 'default'}
                  onClick={() => setActiveCategory(category)}
                  style={{
                    whiteSpace: 'normal',
                    height: 'auto',
                    textAlign: 'center',
                    fontSize: 15,
                    padding: '10px 16px',
                    borderRadius: 12,
                    lineHeight: 1.2,
                  }}
                >
                  {category}
                </Button>
              ))}
            </Group>
            <Accordion multiple defaultValue={defaultOpenedCategories} mt="xs">
              {categoryEntries.map(([categoryName, categoryRecipes]) => (
                <Accordion.Item key={categoryName} value={categoryName}>
                  <Accordion.Control>
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={600} style={{ wordBreak: 'break-word' }}>
                        {categoryName}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {categoryRecipes.length}
                      </Text>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="sm" className="recipe-cards-grid">
                      {categoryRecipes.map(({ recipe, recipeFavoriteId }, index) => {
                        const batchOut = recipeBatchOutputForPrimaryItem(recipe)
                        const primaryResultItemId = batchOut?.primaryItemId
                        const line1 = (() => {
                          if (!primaryResultItemId || !batchOut) return 'Недостаточно данных для расчета себестоимости'
                          const batchUnits = batchOut.batchUnits
                          if (batchUnits <= 0) return 'Недостаточно данных для расчета себестоимости'

                          let totalInputCost = 0
                          const missingReasons: string[] = []
                          for (const ingredient of recipe.ingredients) {
                            const perUnit = costModel.effectiveCostByItemId.get(ingredient.item)
                            if (perUnit === undefined) {
                              const missingName = getItemName(itemsById[ingredient.item]?.name?.lines) || ingredient.item
                              missingReasons.push(`нет цены ингредиента: ${missingName}`)
                              continue
                            }
                            totalInputCost += perUnit * ingredient.amount
                          }
                          if (recipe.energy > 0) {
                            const energyUnitCost = parsePositiveNumber(energyPrice)
                            if (energyUnitCost === null) {
                              missingReasons.push('нет цены энергии')
                            } else {
                              totalInputCost += energyUnitCost * recipe.energy
                            }
                          }

                          const recipeCraftPerUnit =
                            missingReasons.length === 0 ? totalInputCost / batchUnits : null
                          const buyPerUnit = parsePositiveNumber(buyPricesMerged[primaryResultItemId] ?? null)
                          const resolved =
                            recipeCraftPerUnit !== null && buyPerUnit !== null
                              ? Math.min(recipeCraftPerUnit, buyPerUnit)
                              : recipeCraftPerUnit ?? buyPerUnit

                          let base: string
                          if (resolved !== null) base = `${formatAuctionRub(resolved)} ₽/шт`
                          else {
                            base = buildInsufficientCostMessage(missingReasons, {
                              hasBuyOrLeafPrice: buyPerUnit !== null,
                              buyMissingLabel: 'нет цены скупа',
                              meta: costModel.unresolvedMetaByItemId.get(primaryResultItemId),
                              ingredientNamesById: (id) =>
                                getItemName(itemsById[id]?.name?.lines) || id,
                            })
                          }

                          const dup = getDuplicateCraftDisplayLabel(recipe)
                          const best = costModel.bestRecipeOptionByItemId.get(primaryResultItemId)
                          if (
                            dup &&
                            best &&
                            best.craftPerUnit !== null &&
                            recipeCraftPerUnit !== null &&
                            recipeCraftPerUnit > best.craftPerUnit + 1e-6
                          ) {
                            const bestDup = getDuplicateCraftDisplayLabel(best.recipe)
                            if (bestDup) {
                              base = `${base} · среди дублей выгоднее крафт: ${bestDup} (${formatAuctionRub(best.craftPerUnit)} ₽/шт)`
                            }
                          }

                          return base
                        })()
                        const line3 = (() => {
                          if (!authToken) return 'Войдите, чтобы считать гибрид (скуп + аукцион + крафт).'
                          if (!primaryResultItemId || !batchOut) return 'Недостаточно данных для расчета себестоимости'
                          const batchUnits = batchOut.batchUnits
                          if (batchUnits <= 0) return 'Недостаточно данных для расчета себестоимости'

                          let totalInputCost = 0
                          const missingReasons: string[] = []
                          for (const ingredient of recipe.ingredients) {
                            const perUnit = costModelHybrid.effectiveCostByItemId.get(ingredient.item)
                            if (perUnit === undefined) {
                              const missingName =
                                getItemName(itemsById[ingredient.item]?.name?.lines) || ingredient.item
                              missingReasons.push(`нет цены ингредиента: ${missingName}`)
                              continue
                            }
                            totalInputCost += perUnit * ingredient.amount
                          }
                          if (recipe.energy > 0) {
                            const energyUnitCost = parsePositiveNumber(energyPrice)
                            if (energyUnitCost === null) {
                              missingReasons.push('нет цены энергии')
                            } else {
                              totalInputCost += energyUnitCost * recipe.energy
                            }
                          }

                          const recipeCraftPerUnit =
                            missingReasons.length === 0 ? totalInputCost / batchUnits : null
                          const buyPerUnit = parsePositiveNumber(buyPricesMerged[primaryResultItemId] ?? null)
                          const aucRaw = hybridAvgUnitByItemId.get(primaryResultItemId)
                          const aucN =
                            aucRaw !== undefined && Number.isFinite(aucRaw) && aucRaw > 0 ? aucRaw : null
                          const leafPrimary =
                            buyPerUnit !== null && aucN !== null
                              ? Math.min(buyPerUnit, aucN)
                              : buyPerUnit ?? aucN
                          const resolved =
                            recipeCraftPerUnit !== null && leafPrimary !== null
                              ? Math.min(recipeCraftPerUnit, leafPrimary)
                              : recipeCraftPerUnit ?? leafPrimary

                          let base: string
                          if (resolved !== null) {
                            base = `${formatAuctionRub(resolved)} ₽/шт`
                            if (aucN !== null) {
                              base += ` · аук ${formatAuctionRub(aucN)}`
                            } else {
                              const h = hybridAuctionByItemId[primaryResultItemId]
                              if (h) {
                                const w = h.windowUsed || h.windowRequested
                                if (h.tradeCount <= 0) {
                                  base += ` · аук: нет сделок (окно ${w})`
                                } else {
                                  base += ` · аук: нет средней (окно ${w}, ${h.tradeCount} сд.)`
                                }
                              } else if (hybridSettingsMode === 'time_window') {
                                base += ' · аук: нет агрегата за выбранный период'
                              }
                            }
                          } else {
                            base = buildInsufficientCostMessage(missingReasons, {
                              hasBuyOrLeafPrice: leafPrimary !== null,
                              buyMissingLabel: 'нет базовой цены (скуп/аукцион)',
                              meta: costModelHybrid.unresolvedMetaByItemId.get(primaryResultItemId),
                              ingredientNamesById: (id) =>
                                getItemName(itemsById[id]?.name?.lines) || id,
                            })
                          }

                          const dup = getDuplicateCraftDisplayLabel(recipe)
                          const best = costModelHybrid.bestRecipeOptionByItemId.get(primaryResultItemId)
                          if (
                            dup &&
                            best &&
                            best.craftPerUnit !== null &&
                            recipeCraftPerUnit !== null &&
                            recipeCraftPerUnit > best.craftPerUnit + 1e-6
                          ) {
                            const bestDup = getDuplicateCraftDisplayLabel(best.recipe)
                            if (bestDup) {
                              base = `${base} · среди дублей выгоднее крафт: ${bestDup} (${formatAuctionRub(best.craftPerUnit)} ₽/шт)`
                            }
                          }

                          const h = hybridAuctionByItemId[primaryResultItemId]
                          if (h?.expansionMessage) {
                            base = `${base} · ${h.expansionMessage}`
                          }
                          if (h?.undersampled) {
                            base = `${base} · мало сделок относительно порога (${h.tradeCount} < выбранного минимума)`
                          }

                          const liq = liquidityByItemId[primaryResultItemId]
                          if (liq && (aucN !== null || h)) {
                            base = `${base} · ликвидность: ${auctionLiquidityShortLabel(liq.tier)}`
                          }

                          return base
                        })()
                        return (
                          <Box key={`${categoryName}-${recipe.bench}-${index}`} className="recipe-card-grid-cell">
                            <RecipeCard
                              recipe={recipe}
                              itemsById={itemsById}
                              realm={realm}
                              recipeFavoriteId={recipeFavoriteId}
                              showAdminOverrideControls
                              costBuyCraft={line1}
                              costHybrid={line3}
                              usedInRecipes={
                                primaryResultItemId
                                  ? (usedInRecipesByItemId.get(primaryResultItemId) ?? [])
                                  : []
                              }
                              onOpenCostTree={setCostTreeItemId}
                            />
                          </Box>
                        )
                      })}
                    </SimpleGrid>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
            <Modal
              opened={costTreeItemId !== null}
              onClose={() => setCostTreeItemId(null)}
              title={costTreeItemId ? `Дерево крафтов: ${costTreeItemName}` : 'Дерево крафтов'}
              size="90%"
              centered
              styles={appModalStyles}
              classNames={{ content: 'app-modal-content' }}
              removeScrollProps={{
                removeScrollBar: false,
              }}
            >
              {costTreeItemId ? (
                <ScrollArea.Autosize mah={620}>
                  <Stack gap="sm">
                    <Box>
                      <Text size="sm" c="dimmed">
                        Ниже перечислены ингредиенты для одного запуска выбранного крафта итогового предмета (полный
                        выход рецепта). Дробные количества возможны только из-за бонусного выхода в рецепте; при
                        необходимости вложенные крафты округляются вверх до целого числа запусков.
                      </Text>
                    </Box>
                    <Divider />
                    <Text
                      size="lg"
                      fw={800}
                      c={
                        ingredientFlow.rootSource === 'craft'
                          ? 'green.4'
                          : ingredientFlow.rootSource === 'buy'
                            ? 'blue.3'
                            : 'yellow.4'
                      }
                    >
                      ПУТЬ ДЛЯ ИТОГОВОГО ПРЕДМЕТА:{' '}
                      {ingredientFlow.rootSource === 'craft'
                        ? 'КРАФТ'
                        : ingredientFlow.rootSource === 'buy'
                          ? 'СКУП'
                          : 'НЕТ ДАННЫХ'}
                    </Text>
                    {ingredientFlow.rootSource === 'buy' ? (
                      <Text size="sm" c="dimmed">
                        Для итогового предмета выбрана базовая закупка (min цены скупа и аукциона по вашим
                        настройкам). Дополнительные ингредиенты в цепочке крафта не используются.
                      </Text>
                    ) : null}
                    {ingredientFlow.rootSource === 'unknown' ? (
                      <Stack gap={4}>
                        <Text size="sm" c="yellow">
                          Не удалось определить путь получения итогового предмета.
                        </Text>
                        {ingredientFlow.rootReasons.map((reason, idx) => (
                          <Text key={`root-reason-${idx}`} size="xs" c="yellow">
                            - {reason}
                          </Text>
                        ))}
                      </Stack>
                    ) : null}
                    {ingredientFlow.rootSource === 'craft' ? (
                      <>
                        {ingredientFlow.rootOutputAmount !== null ? (
                          <Text size="sm" c="dimmed">
                            За один крафт получается {formatBatchAmount(ingredientFlow.rootOutputAmount)} шт. итогового
                            предмета.
                          </Text>
                        ) : null}
                        {ingredientFlow.rows.length === 0 ? (
                          <Text size="sm" c="dimmed">
                            У выбранного крафта нет вложенных ингредиентов.
                          </Text>
                        ) : (
                          <Stack gap={0}>
                            <Group
                              justify="space-between"
                              wrap="nowrap"
                              style={{
                                background: 'rgba(255,255,255,0.03)',
                                padding: '6px 10px',
                              }}
                            >
                              <Text size="xs" c="dimmed" style={{ width: 240 }}>
                                Ингредиент
                              </Text>
                              <Text size="xs" c="dimmed" style={{ width: 90, textAlign: 'right' }}>
                                Кол-во
                              </Text>
                              <Text size="xs" c="dimmed" style={{ width: 130, textAlign: 'right' }}>
                                Кол-во крафтов
                              </Text>
                              <Text size="xs" c="dimmed" style={{ width: 100, textAlign: 'right' }}>
                                Способ
                              </Text>
                              <Text size="xs" c="dimmed" style={{ width: 120, textAlign: 'right' }}>
                                Цена/шт
                              </Text>
                              <Text size="xs" c="dimmed" style={{ width: 120, textAlign: 'right' }}>
                                Сумма
                              </Text>
                            </Group>
                            {ingredientFlow.rows.map((row, idx) => {
                              const rowItem = itemsById[row.itemId]
                              const rowName =
                                row.itemId === ENERGY_ROW_ID ? 'Энергия' : getItemName(rowItem?.name?.lines) || row.itemId
                              const sourceLabel =
                                row.source === 'craft' ? 'Крафт' : row.source === 'buy' ? 'Скуп' : 'Нет данных'
                              const sourceColor =
                                row.source === 'craft' ? 'green.4' : row.source === 'buy' ? 'blue.3' : 'yellow.4'
                              return (
                                <Box
                                  key={`flow-row-${row.itemId}-${idx}`}
                                  style={{
                                    padding: '8px 10px',
                                    background: idx % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                                  }}
                                >
                                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                                    <Text size="sm" style={{ width: 240 }}>
                                      {rowName}
                                    </Text>
                                    <Text size="sm" style={{ width: 90, textAlign: 'right' }}>
                                      {formatBatchAmount(row.amount)}
                                    </Text>
                                    <Text size="sm" style={{ width: 130, textAlign: 'right' }}>
                                      {row.craftRuns > 0 ? formatBatchAmount(row.craftRuns) : '—'}
                                    </Text>
                                    <Text size="sm" c={sourceColor} style={{ width: 100, textAlign: 'right' }}>
                                      {sourceLabel}
                                    </Text>
                                    <Text size="sm" style={{ width: 120, textAlign: 'right' }}>
                                      {row.perUnitCost !== null ? `${formatAuctionRub(row.perUnitCost)} ₽` : '—'}
                                    </Text>
                                    <Text size="sm" style={{ width: 120, textAlign: 'right' }}>
                                      {row.totalCost !== null ? `${formatAuctionRub(row.totalCost)} ₽` : '—'}
                                    </Text>
                                  </Group>
                                  {row.reasons.length > 0 ? (
                                    <Stack gap={2} mt={4}>
                                      {row.reasons.map((reason, reasonIdx) => (
                                        <Text key={`reason-${row.itemId}-${reasonIdx}`} size="xs" c="yellow">
                                          - {reason}
                                        </Text>
                                      ))}
                                    </Stack>
                                  ) : null}
                                </Box>
                              )
                            })}
                          </Stack>
                        )}
                        {ingredientFlow.leftovers.length > 0 ? (
                          <Stack gap="xs" mt="md">
                            <Text size="sm" fw={700}>
                              Остаток после округления вложенных крафтов
                            </Text>
                            <Text size="xs" c="dimmed">
                              Лишний выход промежуточных крафтов, если для покрытия потребности пришлось сделать больше
                              одного запуска рецепта.
                            </Text>
                            <Stack gap={0}>
                              <Group
                                justify="space-between"
                                wrap="nowrap"
                                style={{
                                  background: 'rgba(255,255,255,0.03)',
                                  padding: '6px 10px',
                                }}
                              >
                                <Text size="xs" c="dimmed" style={{ width: 250 }}>
                                  Предмет
                                </Text>
                                <Text size="xs" c="dimmed" style={{ width: 90, textAlign: 'right' }}>
                                  Остаток
                                </Text>
                              </Group>
                              {ingredientFlow.leftovers.map((row, idx) => {
                                const rowItem = itemsById[row.itemId]
                                const rowName = getItemName(rowItem?.name?.lines) || row.itemId
                                return (
                                  <Box
                                    key={`leftover-${row.itemId}-${idx}`}
                                    style={{
                                      padding: '8px 10px',
                                      background: idx % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                                    }}
                                  >
                                    <Group justify="space-between" wrap="nowrap">
                                      <Text size="sm" style={{ width: 250 }}>
                                        {rowName}
                                      </Text>
                                      <Text size="sm" style={{ width: 90, textAlign: 'right' }}>
                                        {formatBatchAmount(row.amount)}
                                      </Text>
                                    </Group>
                                  </Box>
                                )
                              })}
                            </Stack>
                          </Stack>
                        ) : null}
                      </>
                    ) : null}
                  </Stack>
                </ScrollArea.Autosize>
              ) : null}
            </Modal>
          </>
        ) : null}
      </Stack>
    </SectionCard>
  )
}
