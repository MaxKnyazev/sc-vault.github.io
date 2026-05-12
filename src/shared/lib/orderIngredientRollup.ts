import type { HideoutRecipe } from '../../entities/hideout/types'
import type { OrderLine } from '../store/ordersStore'
import { recipeBatchOutputForPrimaryItem } from './recipeBatchOutput'

const EPS = 1e-9

/** Сортировка строк заказа: сначала не готовые, затем готовые (внизу). */
export function sortOrderLines(lines: OrderLine[]): OrderLine[] {
  return [...lines].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.done && b.done) return (a.doneAt ?? 0) - (b.doneAt ?? 0)
    return a.createdOrder - b.createdOrder
  })
}

/**
 * Ингредиенты к закупке с переносом «остатка» между строками:
 * сначала списывается pool (остаток после предыдущих строк), затем докупка;
 * после строки в pool добавляется surplus от ceil(запусков) против дробного «идеального» расхода.
 */
export function rollupOrderIngredientsToBuy(
  linesSorted: OrderLine[],
  recipeByFavoriteId: Map<string, HideoutRecipe>,
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

    for (const ing of recipe.ingredients) {
      const gross = runs * ing.amount
      const exactNeed = exactRuns * ing.amount
      const surplus = Math.max(0, gross - exactNeed)

      const need = gross
      const prevPool = pool.get(ing.item) ?? 0
      const fromPool = Math.min(prevPool, need)
      pool.set(ing.item, prevPool - fromPool)
      const mustBuy = need - fromPool
      if (mustBuy > EPS) {
        buyTotal.set(ing.item, (buyTotal.get(ing.item) ?? 0) + mustBuy)
      }
      const p2 = pool.get(ing.item) ?? 0
      pool.set(ing.item, p2 + surplus)
    }
  }

  return buyTotal
}
