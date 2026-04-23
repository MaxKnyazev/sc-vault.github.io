import { Alert, Box, Button, Divider, Loader, Modal, ScrollArea, SimpleGrid, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { applyRecipeResultOverride } from '../../shared/lib/applyRecipeResultOverride'
import { useRecipeOverridesStore } from '../../shared/store/recipeOverridesStore'
import { useAuthStore } from '../../shared/store/authStore'
import { useIngredientPricesStore } from '../../shared/store/ingredientPricesStore'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'
import type { HideoutRecipe } from '../../entities/hideout/types'

type CostResolvedCard = {
  itemId: string
  amount: number
  name: string
  iconUrl?: string
  qualityColor?: string
  craftCostPerUnit: number | null
  buyCostPerUnit: number | null
  effectiveCostPerUnit: number | null
  status: 'ok' | 'insufficient' | 'cycle'
  statusMessage?: string
}

type RecipeOption = {
  recipe: HideoutRecipe
  outputAmount: number
  craftPerUnit: number | null
  missingIngredientIds: string[]
  hasEnergyGap: boolean
}

type UnresolvedMeta = {
  missingIngredientIds: string[]
  missingEnergy: boolean
  noRecipes: boolean
  noBuy: boolean
  cycleUnanchored: boolean
  unstableCycle: boolean
}

type TreeViewMode = 'selected' | 'all'

function parsePositiveNumber(raw: string | null | undefined): number | null {
  if (!raw) return null
  const normalized = raw.replace(',', '.').trim()
  if (normalized === '') return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function buildCraftCostModel(
  recipes: HideoutRecipe[],
  buyPricesByItemId: Record<string, string>,
  energyPriceRaw: string,
): {
  effectiveCostByItemId: Map<string, number>
  craftCostByItemId: Map<string, number>
  outputAmountByItemId: Map<string, number>
  bestRecipeOptionByItemId: Map<string, RecipeOption>
  recipeOptionsByItemId: Map<string, RecipeOption[]>
  cyclicItemIds: Set<string>
  cycleAnchoredItemIds: Set<string>
  unresolvedItemIds: Set<string>
  unresolvedMetaByItemId: Map<string, UnresolvedMeta>
} {
  const EPS = 1e-9
  const buyCostByItemId = new Map<string, number>()
  for (const [itemId, raw] of Object.entries(buyPricesByItemId)) {
    const parsed = parsePositiveNumber(raw)
    if (parsed !== null) {
      buyCostByItemId.set(itemId, parsed)
    }
  }
  const energyCost = parsePositiveNumber(energyPriceRaw)

  const effectiveCostByItemId = new Map<string, number>(buyCostByItemId)
  const craftCostByItemId = new Map<string, number>()
  const outputAmountByItemId = new Map<string, number>()
  const recipeOptionsByItemId = new Map<string, RecipeOption[]>()
  const bestRecipeOptionByItemId = new Map<string, RecipeOption>()

  const recipesByResultItemId = new Map<string, Array<{ recipe: HideoutRecipe; outputAmount: number }>>()
  const craftableSet = new Set<string>()
  for (const recipe of recipes) {
    for (const entry of recipe.result) {
      if (entry.amount <= 0) continue
      craftableSet.add(entry.item)
      const list = recipesByResultItemId.get(entry.item) ?? []
      list.push({ recipe, outputAmount: entry.amount })
      recipesByResultItemId.set(entry.item, list)
    }
  }

  // Build craft dependency graph: result item -> ingredient item (craftable only).
  const graph = new Map<string, Set<string>>()
  for (const itemId of craftableSet) {
    graph.set(itemId, new Set<string>())
  }
  for (const recipe of recipes) {
    for (const result of recipe.result) {
      if (result.amount <= 0) continue
      for (const ingredient of recipe.ingredients) {
        if (craftableSet.has(ingredient.item)) {
          graph.get(result.item)!.add(ingredient.item)
        }
      }
    }
  }

  // Tarjan SCC decomposition.
  const components: string[][] = []
  const itemToComponentIndex = new Map<string, number>()
  const tarjanIndex = new Map<string, number>()
  const tarjanLow = new Map<string, number>()
  const tarjanStack: string[] = []
  const onStack = new Set<string>()
  let indexCounter = 0

  const tarjanDfs = (node: string) => {
    tarjanIndex.set(node, indexCounter)
    tarjanLow.set(node, indexCounter)
    indexCounter += 1
    tarjanStack.push(node)
    onStack.add(node)

    for (const next of graph.get(node) ?? []) {
      if (!tarjanIndex.has(next)) {
        tarjanDfs(next)
        tarjanLow.set(node, Math.min(tarjanLow.get(node)!, tarjanLow.get(next)!))
      } else if (onStack.has(next)) {
        tarjanLow.set(node, Math.min(tarjanLow.get(node)!, tarjanIndex.get(next)!))
      }
    }

    if (tarjanLow.get(node) !== tarjanIndex.get(node)) return
    const component: string[] = []
    while (tarjanStack.length > 0) {
      const popped = tarjanStack.pop()!
      onStack.delete(popped)
      component.push(popped)
      itemToComponentIndex.set(popped, components.length)
      if (popped === node) break
    }
    components.push(component)
  }

  for (const node of craftableSet) {
    if (!tarjanIndex.has(node)) {
      tarjanDfs(node)
    }
  }

  const componentDeps = new Map<number, Set<number>>()
  for (let i = 0; i < components.length; i += 1) {
    componentDeps.set(i, new Set<number>())
  }
  for (const [itemId, deps] of graph.entries()) {
    const fromComp = itemToComponentIndex.get(itemId)!
    for (const depItem of deps) {
      const toComp = itemToComponentIndex.get(depItem)!
      if (toComp !== fromComp) componentDeps.get(fromComp)!.add(toComp)
    }
  }

  const componentOrder: number[] = []
  const visitedComp = new Set<number>()
  const visitComp = (compIdx: number) => {
    if (visitedComp.has(compIdx)) return
    visitedComp.add(compIdx)
    for (const dep of componentDeps.get(compIdx) ?? []) {
      visitComp(dep)
    }
    componentOrder.push(compIdx)
  }
  for (let i = 0; i < components.length; i += 1) {
    visitComp(i)
  }

  const cyclicItemIds = new Set<string>()
  const cycleAnchoredItemIds = new Set<string>()
  const unstableCycleItemIds = new Set<string>()

  const evaluateRecipeOption = (
    recipe: HideoutRecipe,
    outputAmount: number,
    resolveCost: (itemId: string) => number | undefined,
  ): RecipeOption => {
    let totalInputCost = 0
    const missingIngredientIds: string[] = []
    for (const ingredient of recipe.ingredients) {
      const perUnit = resolveCost(ingredient.item)
      if (perUnit === undefined) {
        missingIngredientIds.push(ingredient.item)
        continue
      }
      totalInputCost += perUnit * ingredient.amount
    }
    let hasEnergyGap = false
    if (recipe.energy > 0) {
      if (energyCost === null) {
        hasEnergyGap = true
      } else {
        totalInputCost += energyCost * recipe.energy
      }
    }
    const hasMissing = missingIngredientIds.length > 0 || hasEnergyGap
    return {
      recipe,
      outputAmount,
      craftPerUnit: hasMissing ? null : totalInputCost / outputAmount,
      missingIngredientIds,
      hasEnergyGap,
    }
  }

  const chooseBestResolvedOption = (options: RecipeOption[]): RecipeOption | null => {
    let best: RecipeOption | null = null
    for (const option of options) {
      if (option.craftPerUnit === null) continue
      if (!best || option.craftPerUnit < (best.craftPerUnit ?? Number.POSITIVE_INFINITY)) {
        best = option
      }
    }
    return best
  }

  for (const compIdx of componentOrder) {
    const compItems = components[compIdx] ?? []
    if (compItems.length === 0) continue

    const hasSelfLoop = compItems.some((itemId) => (graph.get(itemId) ?? new Set<string>()).has(itemId))
    const isCyclicComponent = compItems.length > 1 || hasSelfLoop
    if (isCyclicComponent) {
      for (const itemId of compItems) cyclicItemIds.add(itemId)
    }

    if (isCyclicComponent) {
      const localCost = new Map<string, number | undefined>()
      for (const itemId of compItems) {
        localCost.set(itemId, buyCostByItemId.get(itemId))
      }

      let reachedMaxIterations = true
      const maxIter = Math.max(20, compItems.length * 24)
      for (let iter = 0; iter < maxIter; iter += 1) {
        let changed = false
        for (const itemId of compItems) {
          const variants = recipesByResultItemId.get(itemId) ?? []
          let bestCraft = Number.POSITIVE_INFINITY
          for (const variant of variants) {
            const option = evaluateRecipeOption(variant.recipe, variant.outputAmount, (ingredientId) => {
              if (compItems.includes(ingredientId)) return localCost.get(ingredientId)
              return effectiveCostByItemId.get(ingredientId)
            })
            if (option.craftPerUnit !== null) {
              bestCraft = Math.min(bestCraft, option.craftPerUnit)
            }
          }
          const buy = buyCostByItemId.get(itemId)
          const candidate = Math.min(
            buy ?? Number.POSITIVE_INFINITY,
            Number.isFinite(bestCraft) ? bestCraft : Number.POSITIVE_INFINITY,
          )
          if (!Number.isFinite(candidate)) continue
          const prev = localCost.get(itemId)
          if (prev === undefined || candidate < prev - EPS) {
            localCost.set(itemId, candidate)
            changed = true
          }
        }
        if (!changed) {
          reachedMaxIterations = false
          break
        }
      }
      if (reachedMaxIterations) {
        for (const itemId of compItems) unstableCycleItemIds.add(itemId)
      }

      for (const itemId of compItems) {
        const resolved = localCost.get(itemId)
        if (resolved !== undefined && Number.isFinite(resolved)) {
          effectiveCostByItemId.set(itemId, resolved)
          cycleAnchoredItemIds.add(itemId)
        } else {
          effectiveCostByItemId.delete(itemId)
        }
      }
      continue
    }

    const itemId = compItems[0]!
    const variants = recipesByResultItemId.get(itemId) ?? []
    let bestCraft = Number.POSITIVE_INFINITY
    for (const variant of variants) {
      const option = evaluateRecipeOption(variant.recipe, variant.outputAmount, (ingredientId) =>
        effectiveCostByItemId.get(ingredientId),
      )
      if (option.craftPerUnit !== null) {
        bestCraft = Math.min(bestCraft, option.craftPerUnit)
      }
    }
    const buy = buyCostByItemId.get(itemId)
    const nextEffective = Math.min(
      buy ?? Number.POSITIVE_INFINITY,
      Number.isFinite(bestCraft) ? bestCraft : Number.POSITIVE_INFINITY,
    )
    if (Number.isFinite(nextEffective)) {
      effectiveCostByItemId.set(itemId, nextEffective)
    } else {
      effectiveCostByItemId.delete(itemId)
    }
  }

  // Build final options, selected options, and normalized effective/craft costs.
  for (const itemId of craftableSet) {
    const variants = recipesByResultItemId.get(itemId) ?? []
    const options = variants.map((variant) =>
      evaluateRecipeOption(variant.recipe, variant.outputAmount, (ingredientId) => effectiveCostByItemId.get(ingredientId)),
    )
    options.sort((a, b) => {
      if (a.craftPerUnit === null && b.craftPerUnit === null) return 0
      if (a.craftPerUnit === null) return 1
      if (b.craftPerUnit === null) return -1
      return a.craftPerUnit - b.craftPerUnit
    })
    recipeOptionsByItemId.set(itemId, options)

    const best = chooseBestResolvedOption(options)
    if (best) {
      bestRecipeOptionByItemId.set(itemId, best)
      craftCostByItemId.set(itemId, best.craftPerUnit!)
      outputAmountByItemId.set(itemId, best.outputAmount)
    } else {
      craftCostByItemId.delete(itemId)
      outputAmountByItemId.delete(itemId)
    }

    const buy = buyCostByItemId.get(itemId)
    const bestCraft = best?.craftPerUnit ?? null
    const nextEffective =
      buy !== undefined && bestCraft !== null
        ? Math.min(buy, bestCraft)
        : buy !== undefined
          ? buy
          : bestCraft !== null
            ? bestCraft
            : null
    if (nextEffective !== null) {
      effectiveCostByItemId.set(itemId, nextEffective)
    } else {
      effectiveCostByItemId.delete(itemId)
    }
  }

  const unresolvedMetaByItemId = new Map<string, UnresolvedMeta>()
  const unresolvedItemIds = new Set<string>()
  for (const id of craftableSet) {
    const options = recipeOptionsByItemId.get(id) ?? []
    const missingIngredientIds = [...new Set(options.flatMap((option) => option.missingIngredientIds))]
    const missingEnergy = options.some((option) => option.hasEnergyGap)
    const noRecipes = options.length === 0
    const noBuy = !buyCostByItemId.has(id)
    const cycleUnanchored = cyclicItemIds.has(id) && !cycleAnchoredItemIds.has(id)
    const unstableCycle = unstableCycleItemIds.has(id)
    const meta: UnresolvedMeta = {
      missingIngredientIds,
      missingEnergy,
      noRecipes,
      noBuy,
      cycleUnanchored,
      unstableCycle,
    }
    unresolvedMetaByItemId.set(id, meta)
    if (!effectiveCostByItemId.has(id)) {
      unresolvedItemIds.add(id)
    }
  }

  return {
    effectiveCostByItemId,
    craftCostByItemId,
    outputAmountByItemId,
    bestRecipeOptionByItemId,
    recipeOptionsByItemId,
    cyclicItemIds,
    cycleAnchoredItemIds,
    unresolvedItemIds,
    unresolvedMetaByItemId,
  }
}

export function CostPricePage() {
  const { recipes, itemsById, realm, isLoading, error, fetchRecipes } = useHideoutStore()
  const recipeOverridesById = useRecipeOverridesStore((s) => s.byRecipeId)
  const loadOverrides = useRecipeOverridesStore((s) => s.loadOverrides)
  const craftBranchLevels = useAuthStore((s) => s.user?.craftBranchLevels ?? null)
  const buyPricesByItemId = useIngredientPricesStore((s) => s.buyPricesByItemId)
  const energyPrice = useIngredientPricesStore((s) => s.energyPrice)
  const loadRemoteBuyPrices = useIngredientPricesStore((s) => s.loadRemoteBuyPrices)
  const [treeItemId, setTreeItemId] = useState<string | null>(null)
  const [treeViewMode, setTreeViewMode] = useState<TreeViewMode>('selected')

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
    () => recipes.map((recipe) => applyRecipeResultOverride(recipe, recipeOverridesById, craftBranchLevels)),
    [recipes, recipeOverridesById, craftBranchLevels],
  )

  const costModel = useMemo(
    () => buildCraftCostModel(adjustedRecipes, buyPricesByItemId, energyPrice),
    [adjustedRecipes, buyPricesByItemId, energyPrice],
  )

  const craftedItems = useMemo<CostResolvedCard[]>(() => {
    const {
      effectiveCostByItemId,
      craftCostByItemId,
      outputAmountByItemId,
      bestRecipeOptionByItemId,
      cyclicItemIds,
      cycleAnchoredItemIds,
      unresolvedMetaByItemId,
    } = costModel
    const craftableItemIds = new Set<string>()
    for (const recipe of adjustedRecipes) {
      for (const entry of recipe.result) {
        if (entry.amount > 0) craftableItemIds.add(entry.item)
      }
    }

    return [...craftableItemIds]
      .map((itemId) => {
        const item = itemsById[itemId]
        const amount = bestRecipeOptionByItemId.get(itemId)?.outputAmount ?? outputAmountByItemId.get(itemId) ?? 1
        const buyCostPerUnit = parsePositiveNumber(buyPricesByItemId[itemId] ?? null)
        const craftCostPerUnit = craftCostByItemId.get(itemId) ?? null
        const effectiveCostPerUnit = effectiveCostByItemId.get(itemId) ?? null
        let status: CostResolvedCard['status'] = 'ok'
        let statusMessage: string | undefined
        const unresolvedMeta = unresolvedMetaByItemId.get(itemId)
        if (effectiveCostPerUnit === null) {
          status = cyclicItemIds.has(itemId) ? 'cycle' : 'insufficient'
          const reasons: string[] = []
          if (unresolvedMeta?.cycleUnanchored) {
            reasons.push('цикл без ценового якоря')
          }
          if (unresolvedMeta?.unstableCycle) {
            reasons.push('цикл не сошелся')
          }
          if (unresolvedMeta?.missingEnergy) {
            reasons.push('нет цены энергии')
          }
          if ((unresolvedMeta?.missingIngredientIds.length ?? 0) > 0) {
            reasons.push(
              `нет цен ингредиентов: ${unresolvedMeta!.missingIngredientIds
                .map((id) => getItemName(itemsById[id]?.name?.lines) || id)
                .join(', ')}`,
            )
          }
          if (unresolvedMeta?.noRecipes) {
            reasons.push('нет доступных крафтовых рецептов')
          }
          if (unresolvedMeta?.noBuy) {
            reasons.push('нет цены скупа')
          }
          statusMessage =
            reasons.length > 0
              ? `Недостаточно данных для расчета себестоимости (${reasons.join('; ')})`
              : 'Недостаточно данных для расчета себестоимости'
        } else if (cyclicItemIds.has(itemId)) {
          status = 'cycle'
          statusMessage = cycleAnchoredItemIds.has(itemId)
            ? 'Рассчитано с учетом цикла (использован ценовой якорь)'
            : 'Рассчитано в цикле (проверьте корректность якорей)'
        }
        return {
          itemId,
          amount,
          name: getItemName(item?.name?.lines) || itemId,
          iconUrl: item ? buildItemIconUrl(item.icon, realm) : undefined,
          qualityColor: item?.color,
          buyCostPerUnit,
          craftCostPerUnit,
          effectiveCostPerUnit,
          status,
          statusMessage,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [adjustedRecipes, buyPricesByItemId, costModel, itemsById, realm])

  const treeItemName = useMemo(() => {
    if (!treeItemId) return ''
    return getItemName(itemsById[treeItemId]?.name?.lines) || treeItemId
  }, [itemsById, treeItemId])

  const renderTreeNode = (itemId: string, depth: number, amountNeeded: number, path: string[]): ReactNode => {
    const MAX_DEPTH = 8
    const item = itemsById[itemId]
    const itemName = getItemName(item?.name?.lines) || itemId
    const buyCostPerUnit = parsePositiveNumber(buyPricesByItemId[itemId] ?? null)
    const effectiveCostPerUnit = costModel.effectiveCostByItemId.get(itemId) ?? null
    const bestRecipe = costModel.bestRecipeOptionByItemId.get(itemId) ?? null
    const allOptions = costModel.recipeOptionsByItemId.get(itemId) ?? []
    const unresolvedMeta = costModel.unresolvedMetaByItemId.get(itemId)
    const isCycle = path.includes(itemId)
    const isDepthLimitReached = depth >= MAX_DEPTH

    const chosenSource: 'craft' | 'buy' | 'unknown' =
      bestRecipe !== null &&
      bestRecipe.craftPerUnit !== null &&
      (buyCostPerUnit === null || bestRecipe.craftPerUnit <= buyCostPerUnit + 1e-9)
        ? 'craft'
        : buyCostPerUnit !== null
          ? 'buy'
          : 'unknown'
    const hasResolvableCraftVariant = allOptions.some((entry) => entry.craftPerUnit !== null)

    return (
      <Stack
        key={`${itemId}-${depth}-${amountNeeded}`}
        gap={8}
        p="xs"
        style={{
          marginLeft: depth * 16,
          borderLeft: depth > 0 ? '1px dashed var(--mantine-color-default-border)' : undefined,
        }}
      >
        <Text size="sm" fw={700}>
          {itemName} x{Number(amountNeeded.toFixed(3))}
        </Text>
        <Text size="xs" c="dimmed">
          Итоговая себестоимость: {effectiveCostPerUnit !== null ? `${formatAuctionRub(effectiveCostPerUnit)} ₽/шт` : 'Недостаточно данных'}
        </Text>
        <Text size="lg" fw={800} c={chosenSource === 'craft' ? 'green.4' : chosenSource === 'buy' ? 'blue.3' : 'yellow.4'}>
          ПУТЬ РАСЧЕТА: {chosenSource === 'craft' ? 'КРАФТ' : chosenSource === 'buy' ? 'СКУП' : 'НЕТ ДАННЫХ'}
        </Text>
        {isCycle ? (
          <Text size="xs" c="yellow">
            Обнаружен цикл зависимостей, ветка обрезана.
          </Text>
        ) : null}
        {isDepthLimitReached ? (
          <Text size="xs" c="yellow">
            Достигнут лимит глубины дерева.
          </Text>
        ) : null}
        {!isCycle && !isDepthLimitReached ? (
          <Box>
            <Divider my={4} />
            <Text size="sm" fw={700} mb={6}>
              {treeViewMode === 'all' ? 'Альтернативы' : 'Выбранная ветка'}
            </Text>
            {treeViewMode === 'all' ? (
              <Stack gap={6}>
                <Box
                  p="xs"
                  style={{
                    borderRadius: 8,
                    border: '1px solid var(--mantine-color-default-border)',
                  }}
                >
                  <Text size="xs" fw={700} c={chosenSource === 'buy' ? 'green.4' : undefined}>
                    Скуп {chosenSource === 'buy' ? '(выбран)' : ''}
                  </Text>
                  <Text size="xs" c={buyCostPerUnit !== null ? 'dimmed' : 'yellow'}>
                    {buyCostPerUnit !== null ? `${formatAuctionRub(buyCostPerUnit)} ₽/шт` : 'Нет цены скупа'}
                  </Text>
                </Box>
                {allOptions.length === 0 ? (
                  <Text size="xs" c="yellow">
                    Для предмета нет крафтовых рецептов.
                  </Text>
                ) : null}
                {allOptions.length > 0 && !hasResolvableCraftVariant ? (
                  <Box
                    p="xs"
                    style={{ borderRadius: 8, border: '1px solid var(--mantine-color-default-border)' }}
                  >
                    <Text size="xs" c="yellow">
                      Нет данных для расчета крафта.
                    </Text>
                    {unresolvedMeta?.missingEnergy ? (
                      <Text size="xs" c="yellow">
                        Не хватает: цены энергии.
                      </Text>
                    ) : null}
                    {(unresolvedMeta?.missingIngredientIds.length ?? 0) > 0 ? (
                      <Text size="xs" c="yellow">
                        Не хватает: себестоимости ингредиентов ({unresolvedMeta!.missingIngredientIds
                          .map((id) => getItemName(itemsById[id]?.name?.lines) || id)
                          .join(', ')}).
                      </Text>
                    ) : null}
                  </Box>
                ) : null}
                {allOptions.map((option, idx) => {
                  const isBestRecipe =
                    bestRecipe !== null &&
                    bestRecipe.recipe === option.recipe &&
                    Math.abs(bestRecipe.outputAmount - option.outputAmount) < 1e-9
                  const isSelectedCraft = chosenSource === 'craft' && isBestRecipe
                  const isInsufficient = option.craftPerUnit === null
                  return (
                    <Box
                      key={`${itemId}-variant-${idx}-${option.outputAmount}`}
                      p="xs"
                      style={{
                        borderRadius: 8,
                        border: '1px solid var(--mantine-color-default-border)',
                      }}
                    >
                      <Text size="xs" fw={700} c={isSelectedCraft ? 'green.4' : isInsufficient ? 'yellow' : undefined}>
                        Крафт #{idx + 1} {isSelectedCraft ? '(выбран)' : ''}
                      </Text>
                      <Text size="xs" c={isInsufficient ? 'yellow' : 'dimmed'}>
                        Выход: {option.outputAmount} шт. · Энергия: {option.recipe.energy} · Себестоимость:{' '}
                        {option.craftPerUnit !== null
                          ? `${formatAuctionRub(option.craftPerUnit)} ₽/шт`
                          : 'Недостаточно данных'}
                      </Text>
                      {option.hasEnergyGap ? (
                        <Text size="xs" c="yellow">
                          Не хватает: цены энергии для этого крафта.
                        </Text>
                      ) : null}
                      {option.missingIngredientIds.length > 0 ? (
                        <Text size="xs" c="yellow">
                          Не хватает: себестоимости ингредиентов ({option.missingIngredientIds
                            .map((id) => getItemName(itemsById[id]?.name?.lines) || id)
                            .join(', ')}).
                        </Text>
                      ) : null}
                      <Stack gap={5} mt={6}>
                        {option.recipe.ingredients.map((ingredient) => {
                          const childAmount = (amountNeeded * ingredient.amount) / option.outputAmount
                          return renderTreeNode(ingredient.item, depth + 1, childAmount, [...path, itemId])
                        })}
                      </Stack>
                    </Box>
                  )
                })}
              </Stack>
            ) : (
              <Stack gap={6}>
                {chosenSource === 'buy' ? (
                  <Box
                    p="xs"
                    style={{
                      borderRadius: 8,
                      border: '1px solid var(--mantine-color-default-border)',
                    }}
                  >
                    <Text size="xs" fw={700} c="green.4">
                      Скуп (выбран)
                    </Text>
                    <Text size="xs" c={buyCostPerUnit !== null ? 'dimmed' : 'yellow'}>
                      {buyCostPerUnit !== null ? `${formatAuctionRub(buyCostPerUnit)} ₽/шт` : 'Нет цены скупа'}
                    </Text>
                  </Box>
                ) : null}
                {chosenSource === 'craft' && bestRecipe ? (
                  <Box
                    p="xs"
                    style={{
                      borderRadius: 8,
                      border: '1px solid var(--mantine-color-default-border)',
                    }}
                  >
                    <Text size="xs" fw={700} c="green.4">
                      Крафт (выбран)
                    </Text>
                    <Text size="xs" c="dimmed">
                      Выход: {bestRecipe.outputAmount} шт. · Энергия: {bestRecipe.recipe.energy} · Себестоимость:{' '}
                      {bestRecipe.craftPerUnit !== null
                        ? `${formatAuctionRub(bestRecipe.craftPerUnit)} ₽/шт`
                        : 'Недостаточно данных'}
                    </Text>
                    <Stack gap={5} mt={6}>
                      {bestRecipe.recipe.ingredients.map((ingredient) => {
                        const childAmount = (amountNeeded * ingredient.amount) / bestRecipe.outputAmount
                        return renderTreeNode(ingredient.item, depth + 1, childAmount, [...path, itemId])
                      })}
                    </Stack>
                  </Box>
                ) : null}
                {chosenSource === 'unknown' ? (
                  <Box p="xs" style={{ borderRadius: 8, border: '1px solid var(--mantine-color-default-border)' }}>
                    <Text size="xs" c="yellow">
                      Нет данных для выбора пути.
                    </Text>
                    {unresolvedMeta?.missingEnergy ? (
                      <Text size="xs" c="yellow">
                        Не хватает: цены энергии.
                      </Text>
                    ) : null}
                    {(unresolvedMeta?.missingIngredientIds.length ?? 0) > 0 ? (
                      <Text size="xs" c="yellow">
                        Не хватает: себестоимости ингредиентов ({unresolvedMeta!.missingIngredientIds
                          .map((id) => getItemName(itemsById[id]?.name?.lines) || id)
                          .join(', ')}).
                      </Text>
                    ) : null}
                    {unresolvedMeta?.noBuy ? (
                      <Text size="xs" c="yellow">
                        Не хватает: цены скупа.
                      </Text>
                    ) : null}
                  </Box>
                ) : null}
              </Stack>
            )}
          </Box>
        ) : null}
        {!isCycle && isDepthLimitReached ? (
          <Text size="xs" c="dimmed">
            Вложенные альтернативы скрыты из-за лимита глубины.
          </Text>
        ) : null}
      </Stack>
    )
  }

  return (
    <PageContainer>
      <SectionCard title="" description="">
        <Stack gap="md">
          <Text size="xl" fw={700}>
            Себестоимость
          </Text>

          {isLoading ? (
            <Stack gap="xs">
              <Loader size="sm" />
              <Text size="sm">Загрузка крафтовых предметов...</Text>
            </Stack>
          ) : null}

          {error ? (
            <Alert color="red" title="Ошибка загрузки">
              {error}
            </Alert>
          ) : null}

          {!isLoading && !error ? (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3, xl: 4 }} spacing="sm" verticalSpacing="sm">
              {craftedItems.map((item) => (
                <Stack
                  key={item.itemId}
                  gap={6}
                  p="md"
                  bd="1px solid var(--mantine-color-default-border)"
                  style={{ borderRadius: 8 }}
                >
                  <ItemBadge
                    itemId={item.itemId}
                    name={item.name}
                    iconUrl={item.iconUrl}
                    amount={item.amount}
                    qualityColor={item.qualityColor}
                    size="result"
                  />
                  <Text size="xs" c="dimmed">
                    1) По цене скупа/крафта:{' '}
                    {item.effectiveCostPerUnit !== null
                      ? `${formatAuctionRub(item.effectiveCostPerUnit)} ₽/шт`
                      : 'Недостаточно данных для расчета себестоимости'}
                  </Text>
                  {item.statusMessage ? (
                    <Text size="xs" c={item.status === 'cycle' ? 'yellow' : 'dimmed'}>
                      {item.statusMessage}
                    </Text>
                  ) : null}
                  <Text size="xs" c="dimmed">
                    {item.effectiveCostPerUnit !== null
                      ? `   · Скуп: ${item.buyCostPerUnit !== null ? `${formatAuctionRub(item.buyCostPerUnit)} ₽/шт` : '—'} · Крафт: ${item.craftCostPerUnit !== null ? `${formatAuctionRub(item.craftCostPerUnit)} ₽/шт` : '—'}`
                      : ''}
                  </Text>
                  <Text size="xs" c="dimmed">
                    2) По цене аукциона: Заглушка (будет реализовано далее)
                  </Text>
                  <Text size="xs" c="dimmed">
                    3) Гибридный вариант: Заглушка (будет реализовано далее)
                  </Text>
                  <Button size="xs" variant="light" color="blue" onClick={() => setTreeItemId(item.itemId)}>
                    Дерево крафтов
                  </Button>
                </Stack>
              ))}
            </SimpleGrid>
          ) : null}
        </Stack>
      </SectionCard>
      <Modal
        opened={treeItemId !== null}
        onClose={() => setTreeItemId(null)}
        title={treeItemId ? `Дерево крафтов: ${treeItemName}` : 'Дерево крафтов'}
        size="xl"
        centered
      >
        {treeItemId ? (
          <ScrollArea.Autosize mah={620}>
            <Stack gap="sm">
              <Box>
                <Text size="sm" c="dimmed">
                  Ниже показан путь расчета себестоимости с выбором минимального варианта на каждом уровне.
                </Text>
              </Box>
              <Box>
                <Button.Group>
                  <Button
                    size="xs"
                    variant={treeViewMode === 'selected' ? 'filled' : 'default'}
                    onClick={() => setTreeViewMode('selected')}
                  >
                    Только выбранный путь
                  </Button>
                  <Button
                    size="xs"
                    variant={treeViewMode === 'all' ? 'filled' : 'default'}
                    onClick={() => setTreeViewMode('all')}
                  >
                    Все альтернативы
                  </Button>
                </Button.Group>
              </Box>
              <Divider />
              {renderTreeNode(treeItemId, 0, 1, [])}
            </Stack>
          </ScrollArea.Autosize>
        ) : null}
      </Modal>
    </PageContainer>
  )
}
