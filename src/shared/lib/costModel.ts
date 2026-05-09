import type { HideoutRecipe } from '../../entities/hideout/types'

/**
 * Себестоимость крафта: для каждого предмета min(скуп, дешёвый крафт по рецептам).
 * Циклы (SCC): итеративное обновление min(скуп, крафт) внутри компоненты до сходимости;
 * вне цикла — уже посчитанные effectiveCost по ингредиентам.
 */
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
    if (parsed !== null) buyCostByItemId.set(itemId, parsed)
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
  const graph = new Map<string, Set<string>>()
  for (const itemId of craftableSet) graph.set(itemId, new Set<string>())
  for (const recipe of recipes) {
    for (const result of recipe.result) {
      if (result.amount <= 0) continue
      for (const ingredient of recipe.ingredients) {
        if (craftableSet.has(ingredient.item)) graph.get(result.item)!.add(ingredient.item)
      }
    }
  }
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
  for (const node of craftableSet) if (!tarjanIndex.has(node)) tarjanDfs(node)
  const componentDeps = new Map<number, Set<number>>()
  for (let i = 0; i < components.length; i += 1) componentDeps.set(i, new Set<number>())
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
    for (const dep of componentDeps.get(compIdx) ?? []) visitComp(dep)
    componentOrder.push(compIdx)
  }
  for (let i = 0; i < components.length; i += 1) visitComp(i)
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
      if (energyCost === null) hasEnergyGap = true
      else totalInputCost += energyCost * recipe.energy
    }
    const hasMissing = missingIngredientIds.length > 0 || hasEnergyGap
    return { recipe, outputAmount, craftPerUnit: hasMissing ? null : totalInputCost / outputAmount, missingIngredientIds, hasEnergyGap }
  }
  const chooseBestResolvedOption = (options: RecipeOption[]): RecipeOption | null => {
    let best: RecipeOption | null = null
    for (const option of options) {
      if (option.craftPerUnit === null) continue
      if (!best || option.craftPerUnit < (best.craftPerUnit ?? Number.POSITIVE_INFINITY)) best = option
    }
    return best
  }
  for (const compIdx of componentOrder) {
    const compItems = components[compIdx] ?? []
    if (compItems.length === 0) continue
    const hasSelfLoop = compItems.some((itemId) => (graph.get(itemId) ?? new Set<string>()).has(itemId))
    const isCyclicComponent = compItems.length > 1 || hasSelfLoop
    if (isCyclicComponent) for (const itemId of compItems) cyclicItemIds.add(itemId)
    if (isCyclicComponent) {
      const compItemsSorted = [...compItems].sort((a, b) => a.localeCompare(b))
      const localCost = new Map<string, number | undefined>()
      for (const itemId of compItemsSorted) localCost.set(itemId, buyCostByItemId.get(itemId))
      let reachedMaxIterations = true
      const maxIter = Math.max(96, compItems.length * 48)
      for (let iter = 0; iter < maxIter; iter += 1) {
        let changed = false
        for (const itemId of compItemsSorted) {
          const variants = recipesByResultItemId.get(itemId) ?? []
          let bestCraft = Number.POSITIVE_INFINITY
          for (const variant of variants) {
            const option = evaluateRecipeOption(variant.recipe, variant.outputAmount, (ingredientId) => {
              if (compItemsSorted.includes(ingredientId)) return localCost.get(ingredientId)
              return effectiveCostByItemId.get(ingredientId)
            })
            if (option.craftPerUnit !== null) bestCraft = Math.min(bestCraft, option.craftPerUnit)
          }
          const buy = buyCostByItemId.get(itemId)
          const candidate = Math.min(buy ?? Number.POSITIVE_INFINITY, Number.isFinite(bestCraft) ? bestCraft : Number.POSITIVE_INFINITY)
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
      if (reachedMaxIterations) for (const itemId of compItemsSorted) unstableCycleItemIds.add(itemId)
      for (const itemId of compItemsSorted) {
        const resolved = localCost.get(itemId)
        if (resolved !== undefined && Number.isFinite(resolved)) {
          effectiveCostByItemId.set(itemId, resolved)
          cycleAnchoredItemIds.add(itemId)
        } else effectiveCostByItemId.delete(itemId)
      }
      continue
    }
    const itemId = compItems[0]!
    const variants = recipesByResultItemId.get(itemId) ?? []
    let bestCraft = Number.POSITIVE_INFINITY
    for (const variant of variants) {
      const option = evaluateRecipeOption(variant.recipe, variant.outputAmount, (ingredientId) => effectiveCostByItemId.get(ingredientId))
      if (option.craftPerUnit !== null) bestCraft = Math.min(bestCraft, option.craftPerUnit)
    }
    const buy = buyCostByItemId.get(itemId)
    const nextEffective = Math.min(buy ?? Number.POSITIVE_INFINITY, Number.isFinite(bestCraft) ? bestCraft : Number.POSITIVE_INFINITY)
    if (Number.isFinite(nextEffective)) effectiveCostByItemId.set(itemId, nextEffective)
    else effectiveCostByItemId.delete(itemId)
  }
  for (const itemId of craftableSet) {
    const variants = recipesByResultItemId.get(itemId) ?? []
    const options = variants.map((variant) => evaluateRecipeOption(variant.recipe, variant.outputAmount, (ingredientId) => effectiveCostByItemId.get(ingredientId)))
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
    const nextEffective = buy !== undefined && bestCraft !== null ? Math.min(buy, bestCraft) : buy !== undefined ? buy : bestCraft !== null ? bestCraft : null
    if (nextEffective !== null) effectiveCostByItemId.set(itemId, nextEffective)
    else effectiveCostByItemId.delete(itemId)
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
    const meta: UnresolvedMeta = { missingIngredientIds, missingEnergy, noRecipes, noBuy, cycleUnanchored, unstableCycle }
    unresolvedMetaByItemId.set(id, meta)
    if (!effectiveCostByItemId.has(id)) unresolvedItemIds.add(id)
  }
  return { effectiveCostByItemId, craftCostByItemId, outputAmountByItemId, bestRecipeOptionByItemId, recipeOptionsByItemId, cyclicItemIds, cycleAnchoredItemIds, unresolvedItemIds, unresolvedMetaByItemId }
}
