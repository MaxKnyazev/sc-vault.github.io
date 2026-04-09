import type { HideoutRecipe } from '../../entities/hideout/types'
import type { RecipeResultOverride } from '../api/backendApi'
import { getRecipeFavoriteId } from './getRecipeFavoriteId'

export function applyRecipeResultOverride(
  recipe: HideoutRecipe,
  byRecipeId: Record<string, RecipeResultOverride>,
): HideoutRecipe {
  const recipeId = getRecipeFavoriteId(recipe)
  const override = byRecipeId[recipeId]
  if (!override || override.baseAmount === null) return recipe

  const hasTarget = recipe.result.some((entry) => entry.item === override.resultItemId)
  if (!hasTarget) return recipe

  return {
    ...recipe,
    result: recipe.result.map((entry) =>
      entry.item === override.resultItemId ? { ...entry, amount: override.baseAmount as number } : entry,
    ),
  }
}

