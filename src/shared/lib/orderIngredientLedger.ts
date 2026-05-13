import type { HideoutRecipe } from '../../entities/hideout/types'
import type { OrderLine } from '../store/ordersStore'
import { getRecipeFavoriteId } from './getRecipeFavoriteId'
import type { CraftCostModel } from './orderLineBuyCraftCost'
import { computeRecipePrimaryUnitRub } from './orderLineBuyCraftCost'
import { recipeBatchOutputForPrimaryItem } from './recipeBatchOutput'
import { sortOrderLines } from './orderIngredientRollup'
import { getDuplicateCraftDisplayLabel } from './craftDuplicateRecipeLabels'

const EPS = 1e-9

export type LedgerMethod = 'craft' | 'vendor' | 'auction'

export type OrderIngredientLedgerRow = {
  key: string
  itemId: string
  name: string
  iconUrl?: string
  qtyDisplay: string
  method: LedgerMethod
  /** Явное имя варианта при method === 'craft' и дублирующихся рецептах (как на странице «Крафты»). */
  craftRecipeLabel?: string | null
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
  costModel: CraftCostModel
  buyPricesMerged: Record<string, string>
  energyPrice: string
  itemName: (itemId: string) => string
  itemIconUrl: (itemId: string) => string | undefined
}

/** Человекочитаемое число для таблицы ингредиентов (допускаются дроби). */
export function formatLedgerQty(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n < 0) return '—'
  const rounded = Math.round(n)
  if (Math.abs(n - rounded) < 1e-6) return String(rounded)
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6 }).format(n)
}

function parseBuyRub(buyPricesMerged: Record<string, string>, itemId: string): number | null {
  const raw = buyPricesMerged[itemId]
  if (raw === undefined || raw === null) return null
  const normalized = String(raw).replace(',', '.').trim()
  if (normalized === '') return null
  const num = Number(normalized)
  if (!Number.isFinite(num) || num <= 0) return null
  return num
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
  runsSum: number
}

/**
 * Симуляция с пулом остатков между строками заказа; разложение до базы.
 * Количества и запуски крафта — точные значения (допускаются дроби), без диапазонов «от–до».
 */
export function buildOrderIngredientLedger(input: BuildOrderIngredientLedgerInput): {
  rows: OrderIngredientLedgerRow[]
  surplus: OrderIngredientSurplusRow[]
} {
  const { lines, recipeByFavoriteId, costModel, buyPricesMerged, energyPrice, itemName, itemIconUrl } = input

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
      prev.row.qtyDisplay = formatLedgerQty(prev.qtySum)
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
      qtyDisplay: formatLedgerQty(qty),
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
    detPerRun: number,
    unitCraft: number | null,
    craftRecipeLabel: string | null,
  ) => {
    const key = `c|${itemId}|${fav}`
    const runsPart = detPerRun > EPS ? qtyNeed / detPerRun : 0
    const totalRub = unitCraft !== null ? unitCraft * qtyNeed : null
    const prev = craftAgg.get(key)
    if (prev) {
      prev.qtySum += qtyNeed
      prev.totalRubSum += totalRub ?? 0
      prev.runsSum += runsPart
      prev.row.qtyDisplay = formatLedgerQty(prev.qtySum)
      prev.row.craftRunsDisplay = formatLedgerQty(prev.runsSum)
      prev.row.totalRubDisplay = formatRub(prev.totalRubSum > 0 ? prev.totalRubSum : null)
      prev.row.unitRubDisplay = prev.qtySum > 0 && prev.totalRubSum > 0 ? formatRub(prev.totalRubSum / prev.qtySum) : '—'
      prev.row.unitRub = prev.qtySum > 0 && prev.totalRubSum > 0 ? prev.totalRubSum / prev.qtySum : null
      prev.row.totalRub = prev.totalRubSum > 0 ? prev.totalRubSum : null
      if (!prev.row.craftRecipeLabel && craftRecipeLabel) prev.row.craftRecipeLabel = craftRecipeLabel
      return
    }
    const row: OrderIngredientLedgerRow = {
      key,
      itemId,
      name: itemName(itemId),
      iconUrl: itemIconUrl(itemId),
      qtyDisplay: formatLedgerQty(qtyNeed),
      method: 'craft',
      craftRecipeLabel: craftRecipeLabel || null,
      craftRunsDisplay: formatLedgerQty(runsPart),
      unitRubDisplay: formatRub(unitCraft),
      totalRubDisplay: formatRub(totalRub),
      unitRub: unitCraft,
      totalRub,
    }
    craftAgg.set(key, {
      row,
      qtySum: qtyNeed,
      totalRubSum: totalRub ?? 0,
      runsSum: runsPart,
    })
  }

  const ensureMaterial = (itemId: string, qtyRaw: number, expanding: Set<string>): void => {
    const qty = Math.max(0, qtyRaw)
    if (qty <= EPS) return

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
    if (fromPool > EPS) {
      pool.set(itemId, (pool.get(itemId) ?? 0) - fromPool)
    }
    const need = qty - fromPool
    if (need <= EPS) return

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
    const batch = recipeBatchOutputForPrimaryItem(recipeAdj)
    if (!batch || batch.batchUnits <= EPS) {
      const buy = parseBuyRub(buyPricesMerged, itemId)
      pushVendor(itemId, need, buy === null ? 'auction' : 'vendor')
      return
    }

    const detPerRun = batch.batchUnits
    const runsExact = need / detPerRun
    const produced = runsExact * detPerRun
    const surplus = produced - need
    pool.set(itemId, (pool.get(itemId) ?? 0) + surplus)

    const unitCraft = computeRecipePrimaryUnitRub(recipeAdj, costModel, buyPricesMerged, energyPrice)
    const craftRecipeLabel = getDuplicateCraftDisplayLabel(recipeAdj)
    pushCraft(itemId, need, fav, detPerRun, unitCraft, craftRecipeLabel)

    expanding.add(itemId)
    try {
      for (const ing of recipeAdj.ingredients) {
        ensureMaterial(ing.item, runsExact * ing.amount, expanding)
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
    if (!batch || batch.batchUnits <= EPS) continue
    const Q = Math.max(0, line.quantity)
    if (Q <= EPS) continue
    const runsLine = Q / batch.batchUnits
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
      surplus.push({ itemId, name: itemName(itemId), qty: q })
    }
  }
  surplus.sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  return { rows, surplus }
}
