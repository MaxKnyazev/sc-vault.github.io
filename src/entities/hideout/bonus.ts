import { hideoutBonusConfig } from '../../shared/config/hideout-bonus'
import type { HideoutRecipe } from './types'

export type CraftBonusCalc = {
  playerLevel: number
  requiredLevel: number
  craftBoostFactor: number
  bonusPercent: number
  guaranteedBonusUnits: number
  extraBonusChancePercent: number
  expectedBonusUnits: number
}

export type MissingCraftBoostFactorReport = {
  totalRecipes: number
  craftedItemsWithoutExplicitFactor: string[]
}

function getRecipeRequiredLevel(recipe: HideoutRecipe): { perkId: string; requiredLevel: number } | null {
  const perks = recipe.requirements?.perks
  if (!perks) return null

  const entries = Object.entries(perks)
  if (!entries.length) return null

  // In DB recipes usually have one station/perk requirement.
  // If there are many, we use the strictest one.
  const [perkId, requiredLevel] = entries.reduce((max, entry) =>
    entry[1] > max[1] ? entry : max,
  )

  return { perkId, requiredLevel }
}

export function getCraftBoostFactor(perkId?: string): number {
  if (!perkId) return hideoutBonusConfig.defaultCraftBoostFactor
  return (
    hideoutBonusConfig.craftBoostFactorByPerk[perkId] ?? hideoutBonusConfig.defaultCraftBoostFactor
  )
}

export function calculateLevelBonus(recipe: HideoutRecipe): CraftBonusCalc {
  const playerLevel = hideoutBonusConfig.level
  const required = getRecipeRequiredLevel(recipe)
  const requiredLevel = required?.requiredLevel ?? 0
  const craftBoostFactor = getCraftBoostFactor(required?.perkId)
  const rawBonusPercent = (playerLevel - requiredLevel) * craftBoostFactor
  const bonusPercent = Math.max(0, rawBonusPercent)
  const guaranteedBonusUnits = Math.floor(bonusPercent / 100)
  const extraBonusChancePercent = bonusPercent % 100
  const expectedBonusUnits = guaranteedBonusUnits + extraBonusChancePercent / 100

  return {
    playerLevel,
    requiredLevel,
    craftBoostFactor,
    bonusPercent,
    guaranteedBonusUnits,
    extraBonusChancePercent,
    expectedBonusUnits,
  }
}

export function collectMissingCraftBoostFactors(
  recipes: HideoutRecipe[],
): MissingCraftBoostFactorReport {
  const missingItems = new Set<string>()

  for (const recipe of recipes) {
    const required = getRecipeRequiredLevel(recipe)
    if (!required) {
      recipe.result.forEach((entry) => missingItems.add(entry.item))
      continue
    }

    const hasExplicitFactor = required.perkId in hideoutBonusConfig.craftBoostFactorByPerk
    if (!hasExplicitFactor) {
      recipe.result.forEach((entry) => missingItems.add(entry.item))
    }
  }

  return {
    totalRecipes: recipes.length,
    craftedItemsWithoutExplicitFactor: [...missingItems].sort(),
  }
}
