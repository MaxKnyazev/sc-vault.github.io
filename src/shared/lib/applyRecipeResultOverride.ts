import type { HideoutRecipe } from '../../entities/hideout/types'
import type { CraftBranchLevels, RecipeResultOverride } from '../api/backendApi'
import { getRecipeFavoriteId } from './getRecipeFavoriteId'
import { getRecipeRequiredSkill, getUserSkillLevel } from './craftSkills'

export function applyRecipeResultOverride(
  recipe: HideoutRecipe,
  byRecipeId: Record<string, RecipeResultOverride>,
  craftBranchLevels?: CraftBranchLevels | null,
): HideoutRecipe {
  if (recipe.requirements?.features?.includes('manual_unpack_no_bonus')) {
    return recipe
  }
  const recipeId = getRecipeFavoriteId(recipe)
  const override = byRecipeId[recipeId]
  if (!override) return recipe

  const hasTarget = recipe.result.some((entry) => entry.item === override.resultItemId)
  if (!hasTarget) return recipe
  const requiredSkill = getRecipeRequiredSkill(recipe)
  const currentSkillLevel = requiredSkill
    ? getUserSkillLevel(craftBranchLevels ?? null, requiredSkill.perkId)
    : 0
  const skillDelta = requiredSkill ? Math.max(0, currentSkillLevel - requiredSkill.level) : 0
  const bonus = override.bonusAmount ?? 0

  return {
    ...recipe,
    result: recipe.result.map((entry) => {
      if (entry.item !== override.resultItemId) return entry
      const baseAmount = override.baseAmount ?? entry.amount
      const amount = Number((baseAmount + bonus * skillDelta).toFixed(3))
      return { ...entry, amount }
    }),
  }
}

