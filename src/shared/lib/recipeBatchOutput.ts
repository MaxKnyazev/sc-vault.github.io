import type { HideoutRecipe } from '../../entities/hideout/types'

/**
 * Делитель полной стоимости рецепта для строки «₽/шт» по первому продукту карточки:
 * если все строки результата — тот же itemId, суммируем количества (партия из нескольких слотов);
 * иначе — только количество в первой строке результата (разные предметы в одном рецепте).
 */
export function recipeBatchOutputForPrimaryItem(recipe: HideoutRecipe): {
  primaryItemId: string
  batchUnits: number
} | null {
  const positive = recipe.result.filter((e) => e.amount > 0)
  if (positive.length === 0) return null
  const first = positive[0]!
  const allSameItem = positive.every((e) => e.item === first.item)
  const batchUnits = allSameItem ? positive.reduce((sum, e) => sum + e.amount, 0) : first.amount
  return { primaryItemId: first.item, batchUnits }
}
