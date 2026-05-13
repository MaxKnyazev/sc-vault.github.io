import type { HybridAuctionItemMetrics } from '../api/backendApi'

/** Только положительные avgPerUnit для min(скуп, аукцион) в модели себестоимости. */
export function buildHybridAuctionAvgMap(
  items: Record<string, HybridAuctionItemMetrics | undefined> | null | undefined,
): Map<string, number> {
  const m = new Map<string, number>()
  if (!items) return m
  for (const [id, row] of Object.entries(items)) {
    const v = row?.avgPerUnit
    if (v !== null && v !== undefined && Number.isFinite(v) && v > 0) m.set(id, v)
  }
  return m
}
