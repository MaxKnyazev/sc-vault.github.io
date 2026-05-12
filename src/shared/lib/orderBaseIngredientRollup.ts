import type { HideoutRecipe } from '../../entities/hideout/types'
import type { OrderLine } from '../store/ordersStore'
import type { CraftCostModel } from './orderLineBuyCraftCost'
import { recipeBatchOutputForPrimaryItem } from './recipeBatchOutput'

const EPS = 1e-9

function parseBuyPerUnit(buyPricesMerged: Record<string, string>, itemId: string): number | null {
  const raw = buyPricesMerged[itemId]
  if (raw === undefined || raw === null) return null
  const normalized = String(raw).replace(',', '.').trim()
  if (normalized === '') return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

type LeafContrib = { itemId: string; gross: number; exact: number }

/**
 * Разложить потребность в itemId на «базовые» позиции:
 * если min(скуп/шт, крафт/шт) = скуп — останавливаемся на этом предмете;
 * иначе раскрываем лучший рецепт крафта (как в costModel) и спускаемся к ингредиентам.
 */
function collectBaseContributions(
  itemId: string,
  gross: number,
  exact: number,
  costModel: CraftCostModel,
  buyPricesMerged: Record<string, string>,
  out: LeafContrib[],
): void {
  if (gross <= EPS) return

  const best = costModel.bestRecipeOptionByItemId.get(itemId)
  const craftPerUnit = costModel.craftCostByItemId.get(itemId)
  const buyPerUnit = parseBuyPerUnit(buyPricesMerged, itemId)

  if (!best || craftPerUnit === undefined) {
    out.push({ itemId, gross, exact })
    return
  }

  if (buyPerUnit !== null && buyPerUnit <= craftPerUnit + EPS) {
    out.push({ itemId, gross, exact })
    return
  }

  const batch = recipeBatchOutputForPrimaryItem(best.recipe)
  if (!batch || batch.batchUnits <= 0) {
    out.push({ itemId, gross, exact })
    return
  }

  const runs = Math.max(1, Math.ceil((gross - EPS) / batch.batchUnits))
  const exactRuns = gross / batch.batchUnits

  for (const ing of best.recipe.ingredients) {
    const g = runs * ing.amount
    const e = exactRuns * ing.amount
    collectBaseContributions(ing.item, g, e, costModel, buyPricesMerged, out)
  }
}

/**
 * К закупке по «базовым» материалам (рекурсивно min(скуп, крафт) на каждом промежуточном),
 * с тем же переносом остатка между строками заказа, что и rollupOrderIngredientsToBuy.
 */
export function rollupOrderBaseIngredientsToBuy(
  linesSorted: OrderLine[],
  recipeByFavoriteId: Map<string, HideoutRecipe>,
  costModel: CraftCostModel,
  buyPricesMerged: Record<string, string>,
): Map<string, number> {
  const pool = new Map<string, number>()
  const buyTotal = new Map<string, number>()

  for (const line of linesSorted) {
    const recipe = recipeByFavoriteId.get(line.recipeFavoriteId)
    if (!recipe) continue
    const batch = recipeBatchOutputForPrimaryItem(recipe)
    if (!batch || batch.batchUnits <= 0) continue
    const Q = Math.max(0, line.quantity)
    if (Q <= 0) continue

    const runs = Math.max(1, Math.ceil((Q - EPS) / batch.batchUnits))
    const exactRuns = Q / batch.batchUnits

    const contribs: LeafContrib[] = []
    for (const ing of recipe.ingredients) {
      const gross = runs * ing.amount
      const exact = exactRuns * ing.amount
      collectBaseContributions(ing.item, gross, exact, costModel, buyPricesMerged, contribs)
    }

    for (const { itemId, gross, exact } of contribs) {
      const surplus = Math.max(0, gross - exact)
      const prevPool = pool.get(itemId) ?? 0
      const fromPool = Math.min(prevPool, gross)
      pool.set(itemId, prevPool - fromPool)
      const mustBuy = gross - fromPool
      if (mustBuy > EPS) {
        buyTotal.set(itemId, (buyTotal.get(itemId) ?? 0) + mustBuy)
      }
      const p2 = pool.get(itemId) ?? 0
      pool.set(itemId, p2 + surplus)
    }
  }

  return buyTotal
}
