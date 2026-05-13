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
  /** min(скуп, аукцион) для базовых материалов; энергия по-прежнему только из скупа в рецепте */
  auctionUnitByItemId?: ReadonlyMap<string, number> | null
  itemName: (itemId: string) => string
  itemIconUrl: (itemId: string) => string | undefined
}

/** Кол-во / кол-во крафтов в заказе: округление вверх до целого; те же значения для рублей «Всего». */
export function formatLedgerQtyCeilInt(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  return String(Math.ceil(n - EPS))
}

function applyVendorCeilTotals(row: OrderIngredientLedgerRow, qtySum: number): void {
  const qI = Math.max(0, Math.ceil(qtySum - EPS))
  row.qtyDisplay = String(qI)
  const u = row.unitRub
  if (u !== null && qI > 0) {
    row.totalRub = u * qI
    row.totalRubDisplay = formatRub(row.totalRub)
    row.unitRubDisplay = formatRub(u)
  } else {
    row.totalRub = null
    row.totalRubDisplay = '—'
    row.unitRubDisplay = formatRub(u)
  }
}

function applyCraftCeilTotals(row: OrderIngredientLedgerRow, qtySum: number, runsSum: number): void {
  const qI = Math.max(0, Math.ceil(qtySum - EPS))
  const rI = Math.max(0, Math.ceil(runsSum - EPS))
  row.qtyDisplay = String(qI)
  row.craftRunsDisplay = String(rI)
  const u = row.unitRub
  if (u !== null && qI > 0) {
    row.totalRub = u * qI
    row.totalRubDisplay = formatRub(row.totalRub)
    row.unitRubDisplay = formatRub(u)
  } else {
    row.totalRub = null
    row.totalRubDisplay = '—'
    row.unitRubDisplay = formatRub(u)
  }
}

/** Остаток и др.: целые без дроби, дробь с точкой, без лишних нулей. */
export function formatLedgerQty(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  const rounded = Math.round(n)
  if (Math.abs(n - rounded) < 1e-6) return String(rounded)
  return parseFloat(n.toFixed(6)).toString()
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

function leafVendorAuction(
  buyPricesMerged: Record<string, string>,
  itemId: string,
  auctionUnitByItemId: ReadonlyMap<string, number> | null | undefined,
): { unitRub: number | null; method: LedgerMethod } {
  const buy = parseBuyRub(buyPricesMerged, itemId)
  const aucRaw = auctionUnitByItemId?.get(itemId)
  const auc = aucRaw !== undefined && Number.isFinite(aucRaw) && aucRaw > 0 ? aucRaw : null
  if (buy !== null && auc !== null) {
    if (buy <= auc + EPS) return { unitRub: buy, method: 'vendor' }
    return { unitRub: auc, method: 'auction' }
  }
  if (buy !== null) return { unitRub: buy, method: 'vendor' }
  if (auc !== null) return { unitRub: auc, method: 'auction' }
  return { unitRub: null, method: 'vendor' }
}

function shouldBuyAsBase(
  itemId: string,
  costModel: CraftCostModel,
  buyPricesMerged: Record<string, string>,
  auctionUnitByItemId?: ReadonlyMap<string, number> | null,
): boolean {
  const best = costModel.bestRecipeOptionByItemId.get(itemId)
  const craftPerUnit = costModel.craftCostByItemId.get(itemId)
  const { unitRub: leaf } = leafVendorAuction(buyPricesMerged, itemId, auctionUnitByItemId)
  if (!best || craftPerUnit === undefined) return true
  if (leaf !== null && leaf <= craftPerUnit + EPS) return true
  return false
}

function formatRub(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—'
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(v))} ₽`
}

type VendorAgg = {
  row: OrderIngredientLedgerRow
  qtySum: number
}

type CraftAgg = {
  row: OrderIngredientLedgerRow
  qtySum: number
  runsSum: number
}

/**
 * Симуляция с пулом остатков между строками заказа; разложение до базы.
 * Внутренние количества могут быть дробными; в таблице «Кол-во» и «Кол-во крафтов» — ceil до целого, «Всего» = ₽/шт. × ceil(кол-во).
 */
export function buildOrderIngredientLedger(input: BuildOrderIngredientLedgerInput): {
  rows: OrderIngredientLedgerRow[]
  surplus: OrderIngredientSurplusRow[]
} {
  const { lines, recipeByFavoriteId, costModel, buyPricesMerged, energyPrice, auctionUnitByItemId, itemName, itemIconUrl } =
    input

  const pool = new Map<string, number>()
  const vendorAgg = new Map<string, VendorAgg>()
  const craftAgg = new Map<string, CraftAgg>()

  const pushVendor = (itemId: string, qty: number) => {
    const { unitRub, method } = leafVendorAuction(buyPricesMerged, itemId, auctionUnitByItemId)
    const key = `v|${itemId}|${method}`
    const prev = vendorAgg.get(key)
    if (prev) {
      prev.qtySum += qty
      applyVendorCeilTotals(prev.row, prev.qtySum)
      return
    }
    const row: OrderIngredientLedgerRow = {
      key,
      itemId,
      name: itemName(itemId),
      iconUrl: itemIconUrl(itemId),
      qtyDisplay: '0',
      method,
      craftRunsDisplay: '—',
      unitRubDisplay: '—',
      totalRubDisplay: '—',
      unitRub,
      totalRub: null,
    }
    applyVendorCeilTotals(row, qty)
    vendorAgg.set(key, { row, qtySum: qty })
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
    const prev = craftAgg.get(key)
    if (prev) {
      prev.qtySum += qtyNeed
      prev.runsSum += runsPart
      applyCraftCeilTotals(prev.row, prev.qtySum, prev.runsSum)
      if (!prev.row.craftRecipeLabel && craftRecipeLabel) prev.row.craftRecipeLabel = craftRecipeLabel
      return
    }
    const row: OrderIngredientLedgerRow = {
      key,
      itemId,
      name: itemName(itemId),
      iconUrl: itemIconUrl(itemId),
      qtyDisplay: '0',
      method: 'craft',
      craftRecipeLabel: craftRecipeLabel || null,
      craftRunsDisplay: '0',
      unitRubDisplay: '—',
      totalRubDisplay: '—',
      unitRub: unitCraft,
      totalRub: null,
    }
    applyCraftCeilTotals(row, qtyNeed, runsPart)
    craftAgg.set(key, {
      row,
      qtySum: qtyNeed,
      runsSum: runsPart,
    })
  }

  const ensureMaterial = (itemId: string, qtyRaw: number, expanding: Set<string>): void => {
    const qty = Math.max(0, qtyRaw)
    if (qty <= EPS) return

    if (expanding.has(itemId)) {
      pushVendor(itemId, qty)
      return
    }
    if (expanding.size >= 48) {
      pushVendor(itemId, qty)
      return
    }

    const fromPool = Math.min(pool.get(itemId) ?? 0, qty)
    if (fromPool > EPS) {
      pool.set(itemId, (pool.get(itemId) ?? 0) - fromPool)
    }
    const need = qty - fromPool
    if (need <= EPS) return

    if (shouldBuyAsBase(itemId, costModel, buyPricesMerged, auctionUnitByItemId)) {
      pushVendor(itemId, need)
      return
    }

    const best = costModel.bestRecipeOptionByItemId.get(itemId)
    if (!best) {
      pushVendor(itemId, need)
      return
    }

    const fav = getRecipeFavoriteId(best.recipe)
    const recipeAdj = recipeByFavoriteId.get(fav) ?? best.recipe
    const batch = recipeBatchOutputForPrimaryItem(recipeAdj)
    if (!batch || batch.batchUnits <= EPS) {
      pushVendor(itemId, need)
      return
    }

    const detPerRun = batch.batchUnits
    const runsExact = need / detPerRun
    const produced = runsExact * detPerRun
    const surplus = produced - need
    pool.set(itemId, (pool.get(itemId) ?? 0) + surplus)

    const unitCraft = computeRecipePrimaryUnitRub(
      recipeAdj,
      costModel,
      buyPricesMerged,
      energyPrice,
      auctionUnitByItemId,
    )
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
