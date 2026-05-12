import type { HideoutRecipe } from '../../entities/hideout/types'
import type { CraftBranchLevels, RecipeResultOverride } from '../api/backendApi'
import type { OrderLine } from '../store/ordersStore'
import { getRecipeFavoriteId } from './getRecipeFavoriteId'
import { getRecipeRequiredSkill, getUserSkillLevel } from './craftSkills'
import type { CraftCostModel } from './orderLineBuyCraftCost'
import { computeRecipePrimaryUnitRub } from './orderLineBuyCraftCost'
import { recipeBatchOutputForPrimaryItem } from './recipeBatchOutput'
import { sortOrderLines } from './orderIngredientRollup'

const EPS = 1e-9

export type LedgerMethod = 'craft' | 'vendor' | 'auction'

export type OrderIngredientLedgerRow = {
  key: string
  itemId: string
  name: string
  iconUrl?: string
  qtyDisplay: string
  method: LedgerMethod
  craftRunsDisplay: string
  unitRubDisplay: string
  totalRubDisplay: string
  unitRub: number | null
  totalRub: number | null
}

export type OrderIngredientSurplusRow = {
  itemId: string
  name: string
  qty: number
}

export type BuildOrderIngredientLedgerInput = {
  lines: OrderLine[]
  recipeByFavoriteId: Map<string, HideoutRecipe>
  recipeOverridesById: Record<string, RecipeResultOverride>
  craftBranchLevels: CraftBranchLevels | null
  costModel: CraftCostModel
  buyPricesMerged: Record<string, string>
  energyPrice: string
  itemName: (itemId: string) => string
  itemIconUrl: (itemId: string) => string | undefined
}

function parseBuyRub(buyPricesMerged: Record<string, string>, itemId: string): number | null {
  const raw = buyPricesMerged[itemId]
  if (raw === undefined || raw === null) return null
  const normalized = String(raw).replace(',', '.').trim()
  if (normalized === '') return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function shouldBuyAsBase(
  itemId: string,
  costModel: CraftCostModel,
  buyPricesMerged: Record<string, string>,
): boolean {
  const best = costModel.bestRecipeOptionByItemId.get(itemId)
  const craftPerUnit = costModel.craftCostByItemId.get(itemId)
  const buyPerUnit = parseBuyRub(buyPricesMerged, itemId)
  if (!best || craftPerUnit === undefined) return true
  if (buyPerUnit !== null && buyPerUnit <= craftPerUnit + EPS) return true
  return false
}

function primaryOutputMinMaxPerRun(
  recipeAdj: HideoutRecipe,
  favoriteId: string,
  recipeOverridesById: Record<string, RecipeResultOverride>,
  craftBranchLevels: CraftBranchLevels | null,
): { primaryItemId: string; minPerRun: number; maxPerRun: number; detPerRun: number } | null {
  const batch = recipeBatchOutputForPrimaryItem(recipeAdj)
  if (!batch || batch.batchUnits <= 0) return null
  const detPerRun = batch.batchUnits
  const ov = recipeOverridesById[favoriteId]
  const required = getRecipeRequiredSkill(recipeAdj)
  const skillDelta = required ? Math.max(0, getUserSkillLevel(craftBranchLevels, required.perkId) - required.level) : 0

  if (!ov || !recipeAdj.result.some((e) => e.item === ov.resultItemId)) {
    return { primaryItemId: batch.primaryItemId, minPerRun: detPerRun, maxPerRun: detPerRun, detPerRun }
  }

  const bonus = ov.bonusAmount ?? 0
  if (bonus === 0 || skillDelta === 0) {
    return { primaryItemId: batch.primaryItemId, minPerRun: detPerRun, maxPerRun: detPerRun, detPerRun }
  }

  const maxPerRun = detPerRun
  const minApprox = Math.max(1, maxPerRun - bonus * skillDelta)
  const minPerRun = Math.min(minApprox, maxPerRun)
  return { primaryItemId: batch.primaryItemId, minPerRun, maxPerRun, detPerRun }
}

function formatIntRange(a: number, b: number): string {
  const ia = Math.round(a)
  const ib = Math.round(b)
  if (ia === ib) return String(ia)
  return `${ia}–${ib}`
}

function formatRunsRange(runsBest: number, runsWorst: number): string {
  const lo = Math.min(runsBest, runsWorst)
  const hi = Math.max(runsBest, runsWorst)
  if (lo === hi) return String(hi)
  return `${lo}–${hi}`
}

function formatRub(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—'
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(v))} ₽`
}

type VendorAgg = {
  row: OrderIngredientLedgerRow
  qtySum: number
  totalRubSum: number
}

type CraftAgg = {
  row: OrderIngredientLedgerRow
  qtySum: number
  totalRubSum: number
  runsLo: number
  runsHi: number
}

/**
 * Целочисленная симуляция: пул остатков между строками заказа, разложение до базы,
 * строки таблицы (скуп / крафт / аукцион при отсутствии скупа), остатки после всех строк.
 */
export function buildOrderIngredientLedger(input: BuildOrderIngredientLedgerInput): {
  rows: OrderIngredientLedgerRow[]
  surplus: OrderIngredientSurplusRow[]
} {
  const {
    lines,
    recipeByFavoriteId,
    recipeOverridesById,
    craftBranchLevels,
    costModel,
    buyPricesMerged,
    energyPrice,
    itemName,
    itemIconUrl,
  } = input

  const pool = new Map<string, number>()
  const vendorAgg = new Map<string, VendorAgg>()
  const craftAgg = new Map<string, CraftAgg>()

  const pushVendor = (itemId: string, qty: number, method: LedgerMethod) => {
    const buy = parseBuyRub(buyPricesMerged, itemId)
    const unitRub = method === 'auction' ? null : buy
    const totalRub = unitRub !== null ? unitRub * qty : null
    const key = `v|${itemId}|${method}`
    const prev = vendorAgg.get(key)
    if (prev) {
      prev.qtySum += qty
      prev.totalRubSum += totalRub ?? 0
      prev.row.qtyDisplay = formatIntRange(prev.qtySum, prev.qtySum)
      prev.row.totalRubDisplay = formatRub(prev.totalRubSum > 0 ? prev.totalRubSum : null)
      prev.row.unitRubDisplay = prev.qtySum > 0 && prev.totalRubSum > 0 ? formatRub(prev.totalRubSum / prev.qtySum) : '—'
      prev.row.unitRub = prev.qtySum > 0 && prev.totalRubSum > 0 ? prev.totalRubSum / prev.qtySum : null
      prev.row.totalRub = prev.totalRubSum > 0 ? prev.totalRubSum : null
      return
    }
    const row: OrderIngredientLedgerRow = {
      key,
      itemId,
      name: itemName(itemId),
      iconUrl: itemIconUrl(itemId),
      qtyDisplay: formatIntRange(qty, qty),
      method,
      craftRunsDisplay: '—',
      unitRubDisplay: formatRub(unitRub),
      totalRubDisplay: formatRub(totalRub),
      unitRub,
      totalRub,
    }
    vendorAgg.set(key, { row, qtySum: qty, totalRubSum: totalRub ?? 0 })
  }

  const pushCraft = (
    itemId: string,
    qtyNeed: number,
    fav: string,
    runsBest: number,
    runsWorst: number,
    unitCraft: number | null,
  ) => {
    const key = `c|${itemId}|${fav}`
    const totalRub = unitCraft !== null ? unitCraft * qtyNeed : null
    const prev = craftAgg.get(key)
    if (prev) {
      prev.qtySum += qtyNeed
      prev.totalRubSum += totalRub ?? 0
      prev.runsLo = Math.min(prev.runsLo, Math.min(runsBest, runsWorst))
      prev.runsHi = Math.max(prev.runsHi, Math.max(runsBest, runsWorst))
      prev.row.qtyDisplay = formatIntRange(prev.qtySum, prev.qtySum)
      prev.row.craftRunsDisplay = formatRunsRange(prev.runsLo, prev.runsHi)
      prev.row.totalRubDisplay = formatRub(prev.totalRubSum > 0 ? prev.totalRubSum : null)
      prev.row.unitRubDisplay = prev.qtySum > 0 && prev.totalRubSum > 0 ? formatRub(prev.totalRubSum / prev.qtySum) : '—'
      prev.row.unitRub = prev.qtySum > 0 && prev.totalRubSum > 0 ? prev.totalRubSum / prev.qtySum : null
      prev.row.totalRub = prev.totalRubSum > 0 ? prev.totalRubSum : null
      return
    }
    const row: OrderIngredientLedgerRow = {
      key,
      itemId,
      name: itemName(itemId),
      iconUrl: itemIconUrl(itemId),
      qtyDisplay: formatIntRange(qtyNeed, qtyNeed),
      method: 'craft',
      craftRunsDisplay: formatRunsRange(runsBest, runsWorst),
      unitRubDisplay: formatRub(unitCraft),
      totalRubDisplay: formatRub(totalRub),
      unitRub: unitCraft,
      totalRub,
    }
    craftAgg.set(key, {
      row,
      qtySum: qtyNeed,
      totalRubSum: totalRub ?? 0,
      runsLo: Math.min(runsBest, runsWorst),
      runsHi: Math.max(runsBest, runsWorst),
    })
  }

  const ensureMaterial = (itemId: string, qtyRaw: number, expanding: Set<string>): void => {
    const qty = Math.max(0, Math.ceil(qtyRaw - EPS))
    if (qty <= 0) return

    if (expanding.has(itemId)) {
      const buy = parseBuyRub(buyPricesMerged, itemId)
      pushVendor(itemId, qty, buy === null ? 'auction' : 'vendor')
      return
    }
    if (expanding.size >= 48) {
      const buy = parseBuyRub(buyPricesMerged, itemId)
      pushVendor(itemId, qty, buy === null ? 'auction' : 'vendor')
      return
    }

    const fromPool = Math.min(pool.get(itemId) ?? 0, qty)
    if (fromPool > 0) {
      pool.set(itemId, (pool.get(itemId) ?? 0) - fromPool)
    }
    const need = qty - fromPool
    if (need <= 0) return

    if (shouldBuyAsBase(itemId, costModel, buyPricesMerged)) {
      const buy = parseBuyRub(buyPricesMerged, itemId)
      pushVendor(itemId, need, buy === null ? 'auction' : 'vendor')
      return
    }

    const best = costModel.bestRecipeOptionByItemId.get(itemId)
    if (!best) {
      const buy = parseBuyRub(buyPricesMerged, itemId)
      pushVendor(itemId, need, buy === null ? 'auction' : 'vendor')
      return
    }

    const fav = getRecipeFavoriteId(best.recipe)
    const recipeAdj = recipeByFavoriteId.get(fav) ?? best.recipe
    const range = primaryOutputMinMaxPerRun(recipeAdj, fav, recipeOverridesById, craftBranchLevels)
    if (!range) {
      const buy = parseBuyRub(buyPricesMerged, itemId)
      pushVendor(itemId, need, buy === null ? 'auction' : 'vendor')
      return
    }

    const runsDet = Math.max(1, Math.ceil((need - EPS) / range.detPerRun))
    const runsBest = Math.max(1, Math.ceil((need - EPS) / range.maxPerRun))
    const runsWorst = Math.max(1, Math.ceil((need - EPS) / Math.max(range.minPerRun, EPS)))
    const produced = runsDet * range.detPerRun
    const surplus = produced - need
    pool.set(itemId, (pool.get(itemId) ?? 0) + surplus)

    const unitCraft = computeRecipePrimaryUnitRub(recipeAdj, costModel, buyPricesMerged, energyPrice)
    pushCraft(itemId, need, fav, runsBest, runsWorst, unitCraft)

    expanding.add(itemId)
    try {
      for (const ing of recipeAdj.ingredients) {
        ensureMaterial(ing.item, runsDet * ing.amount, expanding)
      }
    } finally {
      expanding.delete(itemId)
    }
  }

  const sorted = sortOrderLines(lines.filter((l) => !l.done))
  for (const line of sorted) {
    const recipe = recipeByFavoriteId.get(line.recipeFavoriteId)
    if (!recipe) continue
    const batch = recipeBatchOutputForPrimaryItem(recipe)
    if (!batch || batch.batchUnits <= 0) continue
    const Q = Math.max(0, line.quantity)
    if (Q <= 0) continue
    const runsLine = Math.max(1, Math.ceil((Q - EPS) / batch.batchUnits))
    for (const ing of recipe.ingredients) {
      ensureMaterial(ing.item, runsLine * ing.amount, new Set())
    }
  }

  const rows: OrderIngredientLedgerRow[] = [
    ...[...vendorAgg.values()].map((v) => v.row),
    ...[...craftAgg.values()].map((c) => c.row),
  ]
  rows.sort((a, b) => {
    const order = (m: LedgerMethod) => (m === 'craft' ? 0 : m === 'vendor' ? 1 : 2)
    const d = order(a.method) - order(b.method)
    if (d !== 0) return d
    return a.name.localeCompare(b.name, 'ru')
  })

  const surplus: OrderIngredientSurplusRow[] = []
  for (const [itemId, q] of pool.entries()) {
    if (q > EPS) {
      surplus.push({ itemId, name: itemName(itemId), qty: Math.floor(q + EPS) })
    }
  }
  surplus.sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  return { rows, surplus }
}
