import { Alert, Box, Button, Divider, Group, Loader, Modal, ScrollArea, SimpleGrid, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
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

const ENERGY_ROW_ID = '__energy__'

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

  const formatBatchAmount = (value: number): string => {
    const rounded = Math.round(value)
    if (Math.abs(value - rounded) < 1e-9) {
      return new Intl.NumberFormat('ru-RU').format(rounded)
    }
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(value.toFixed(3)))
  }

  const ingredientFlow = useMemo(() => {
    const EPS = 1e-9
    if (!treeItemId) {
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
      const meta = costModel.unresolvedMetaByItemId.get(itemId)
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
      if (meta.noBuy) reasons.push('нет цены скупа')
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
        if (energyUnitCost !== null) {
          return { source: 'buy', bestRecipe: null, buyCost: energyUnitCost, reasons: [] }
        }
        return { source: 'unknown', bestRecipe: null, buyCost: null, reasons: ['нет цены энергии'] }
      }
      const buyCost = parsePositiveNumber(buyPricesByItemId[itemId] ?? null)
      const bestRecipe = costModel.bestRecipeOptionByItemId.get(itemId) ?? null
      const canCraft = bestRecipe?.craftPerUnit !== null
      if (canCraft && (buyCost === null || (bestRecipe?.craftPerUnit ?? Number.POSITIVE_INFINITY) <= buyCost + 1e-9)) {
        return { source: 'craft', bestRecipe, buyCost, reasons: [] }
      }
      if (buyCost !== null) {
        return { source: 'buy', bestRecipe, buyCost, reasons: [] }
      }
      return { source: 'unknown', bestRecipe, buyCost, reasons: getUnresolvedReasons(itemId) }
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
      rowsByItemId.set(itemId, {
        itemId,
        amount: normalizeAmount(prev.amount + normalizedAmount),
        craftRuns: normalizeAmount(prev.craftRuns + normalizedRuns),
        source: mergedSource,
        perUnitCost: prev.perUnitCost ?? perUnitCost,
        totalCost:
          (prev.perUnitCost ?? perUnitCost) !== null
            ? normalizeAmount((prev.perUnitCost ?? perUnitCost)! * normalizeAmount(prev.amount + normalizedAmount))
            : null,
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
      if (nextLeftover > 0) {
        leftoversByItemId.set(itemId, nextLeftover)
      } else {
        leftoversByItemId.delete(itemId)
      }
      return normalizeAmount(neededAmount - take)
    }

    const walkSelectedPath = (itemId: string, amountNeeded: number, path: string[]) => {
      let normalizedNeeded = normalizeAmount(amountNeeded)
      if (normalizedNeeded <= 0) return
      if (path.includes(itemId)) {
        addRow(itemId, normalizedNeeded, 0, 'unknown', null, ['обнаружен цикл в выбранной ветке'])
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
        const perUnitCost = resolved.source === 'buy' ? resolved.buyCost : null
        addRow(itemId, normalizedNeeded, 0, resolved.source, perUnitCost, resolved.reasons)
        return
      }

      const runs = Math.max(1, Math.ceil((normalizedNeeded - EPS) / resolved.bestRecipe.outputAmount))
      const producedAmount = normalizeAmount(runs * resolved.bestRecipe.outputAmount)
      const leftoverAmount = normalizeAmount(producedAmount - normalizedNeeded)
      addRow(itemId, normalizedNeeded, runs, 'craft', resolved.bestRecipe.craftPerUnit, [])
      if (resolved.bestRecipe.recipe.energy > 0) {
        walkSelectedPath(ENERGY_ROW_ID, normalizeAmount(resolved.bestRecipe.recipe.energy * runs), [...path, itemId])
      }
      if (leftoverAmount > 0) {
        addLeftover(itemId, leftoverAmount)
      }

      for (const ingredient of resolved.bestRecipe.recipe.ingredients) {
        const childAmount = normalizeAmount(ingredient.amount * runs)
        walkSelectedPath(ingredient.item, childAmount, [...path, itemId])
      }
    }

    const rootResolved = resolveSource(treeItemId)
    const rootOutputAmount =
      rootResolved.source === 'craft' && rootResolved.bestRecipe
        ? normalizeAmount(rootResolved.bestRecipe.outputAmount)
        : null
    if (rootResolved.source === 'craft' && rootResolved.bestRecipe) {
      if (rootResolved.bestRecipe.recipe.energy > 0) {
        walkSelectedPath(ENERGY_ROW_ID, normalizeAmount(rootResolved.bestRecipe.recipe.energy), [treeItemId])
      }
      for (const ingredient of rootResolved.bestRecipe.recipe.ingredients) {
        const childAmount = normalizeAmount(ingredient.amount)
        walkSelectedPath(ingredient.item, childAmount, [treeItemId])
      }
    }

    const rows = [...rowsByItemId.values()].sort((a, b) => {
      if (a.source !== b.source) {
        const order: Record<IngredientFlowRow['source'], number> = { craft: 0, buy: 1, unknown: 2 }
        return order[a.source] - order[b.source]
      }
      const aName = getItemName(itemsById[a.itemId]?.name?.lines) || a.itemId
      const bName = getItemName(itemsById[b.itemId]?.name?.lines) || b.itemId
      const normA = a.itemId === ENERGY_ROW_ID ? 'Энергия' : aName
      const normB = b.itemId === ENERGY_ROW_ID ? 'Энергия' : bName
      return normA.localeCompare(normB, 'ru')
    })

    const leftovers = [...leftoversByItemId.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([itemId, amount]) => ({ itemId, amount }))
      .sort((a, b) => {
        const aName = a.itemId === ENERGY_ROW_ID ? 'Энергия' : getItemName(itemsById[a.itemId]?.name?.lines) || a.itemId
        const bName = b.itemId === ENERGY_ROW_ID ? 'Энергия' : getItemName(itemsById[b.itemId]?.name?.lines) || b.itemId
        return aName.localeCompare(bName, 'ru')
      })

    return {
      rootSource: rootResolved.source,
      rootReasons: rootResolved.reasons,
      rootOutputAmount,
      rows,
      leftovers,
    }
  }, [buyPricesByItemId, costModel, itemsById, treeItemId])

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
        size="90%"
        centered
        removeScrollProps={{
          removeScrollBar: false,
        }}
      >
        {treeItemId ? (
          <ScrollArea.Autosize mah={620}>
            <Stack gap="sm">
              <Box>
                <Text size="sm" c="dimmed">
                  Ниже перечислены ингредиенты для одного запуска выбранного крафта итогового предмета (полный выход
                  рецепта). Дробные количества возможны только из-за бонусного выхода в рецепте; при необходимости
                  вложенные крафты округляются вверх до целого числа запусков.
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
                  Для итогового предмета выбран скуп. Дополнительные ингредиенты в цепочке крафта не используются.
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
                        const sourceLabel = row.source === 'craft' ? 'Крафт' : row.source === 'buy' ? 'Скуп' : 'Нет данных'
                        const sourceColor = row.source === 'craft' ? 'green.4' : row.source === 'buy' ? 'blue.3' : 'yellow.4'
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
                        Лишний выход промежуточных крафтов, если для покрытия потребности пришлось сделать больше одного
                        запуска рецепта.
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
                          const rowName =
                            row.itemId === ENERGY_ROW_ID ? 'Энергия' : getItemName(rowItem?.name?.lines) || row.itemId
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
    </PageContainer>
  )
}
