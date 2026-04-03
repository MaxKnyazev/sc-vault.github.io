export const hideoutBonusConfig = {
  level: 5,
  defaultCraftBoostFactor: 75,
  // You can override specific crafting station/perk coefficients here.
  // Key is recipe.requirements.perks entry key from hideout_recipes.json.
  craftBoostFactorByPerk: {} as Record<string, number>,
} as const
