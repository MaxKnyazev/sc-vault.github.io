import type { HideoutRecipe } from '../../entities/hideout/types'

export function extractUniqueCraftableItemIds(recipes: HideoutRecipe[]): string[] {
  const resultIds = recipes.flatMap((recipe) => recipe.result.map((it) => it.item))
  return [...new Set(resultIds)]
}
