import type { HideoutRecipe } from '../../entities/hideout/types'
import { buildCraftCostModel } from './costModel'
import { recipeBatchOutputForPrimaryItem } from './recipeBatchOutput'

export type CraftCostModel = ReturnType<typeof buildCraftCostModel>

function parsePositiveNumber(raw: string | null | undefined): number | null {
  if (!raw) return null
  const normalized = raw.replace(',', '.').trim()
  if (normalized === '') return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** Себестоимость 1 шт. основного продукта рецепта: min(крафт по effectiveCost, min(скуп, аукцион)). */
export function computeRecipePrimaryUnitRub(
  recipe: HideoutRecipe,
  costModel: CraftCostModel,
  buyPricesMerged: Record<string, string>,
  energyPriceRaw: string,
  auctionUnitByItemId?: ReadonlyMap<string, number> | null,
): number | null {
  const batch = recipeBatchOutputForPrimaryItem(recipe)
  if (!batch || batch.batchUnits <= 0) return null

  let totalInputCost = 0
  let blocked = false
  for (const ingredient of recipe.ingredients) {
    const perUnit = costModel.effectiveCostByItemId.get(ingredient.item)
    if (perUnit === undefined) {
      blocked = true
      break
    }
    totalInputCost += perUnit * ingredient.amount
  }
  if (!blocked && recipe.energy > 0) {
    const energyUnitCost = parsePositiveNumber(energyPriceRaw)
    if (energyUnitCost === null) blocked = true
    else totalInputCost += energyUnitCost * recipe.energy
  }
  if (blocked) return null

  const recipeCraftPerUnit = totalInputCost / batch.batchUnits
  const buyPerUnit = parsePositiveNumber(buyPricesMerged[batch.primaryItemId] ?? null)
  const aucRaw = auctionUnitByItemId?.get(batch.primaryItemId)
  const auc =
    aucRaw !== undefined && Number.isFinite(aucRaw) && aucRaw > 0 ? aucRaw : null
  const leafPrimary =
    buyPerUnit !== null && auc !== null ? Math.min(buyPerUnit, auc) : buyPerUnit ?? auc
  if (recipeCraftPerUnit !== null && leafPrimary !== null) return Math.min(recipeCraftPerUnit, leafPrimary)
  return recipeCraftPerUnit ?? leafPrimary
}

export function computeOrderLineTotalRub(
  recipe: HideoutRecipe,
  quantityItems: number,
  costModel: CraftCostModel,
  buyPricesMerged: Record<string, string>,
  energyPriceRaw: string,
  auctionUnitByItemId?: ReadonlyMap<string, number> | null,
): number | null {
  const unit = computeRecipePrimaryUnitRub(
    recipe,
    costModel,
    buyPricesMerged,
    energyPriceRaw,
    auctionUnitByItemId,
  )
  if (unit === null) return null
  return unit * Math.max(0, quantityItems)
}
