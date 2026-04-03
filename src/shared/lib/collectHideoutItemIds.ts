import type { HideoutRecipe } from '../../entities/hideout/types'

export function collectHideoutItemIds(recipes: HideoutRecipe[]): string[] {
  const ids = new Set<string>()
  for (const recipe of recipes) {
    for (const entry of recipe.result) ids.add(entry.item)
    for (const entry of recipe.ingredients) ids.add(entry.item)
  }
  return [...ids].sort()
}
