import type { AuctionHistoryPoint, AuctionHistoryZoom } from '../../shared/api/backendApi'

export type AuctionHistoryChartRow = {
  ts: string
  price: number
  tradeCount: number
  totalQty: number
  totalRevenue: number
}

export function buildAuctionHistoryChartRows(points: AuctionHistoryPoint[]): AuctionHistoryChartRow[] {
  return points
    .filter((p): p is AuctionHistoryPoint & { avgPerUnit: number } => p.avgPerUnit !== null)
    .map((p) => ({
      ts: p.ts,
      price: p.avgPerUnit,
      tradeCount: p.tradeCount,
      totalQty: p.totalQty,
      totalRevenue: p.totalRevenue,
    }))
}

export function getPriceExtents(rows: AuctionHistoryChartRow[]): { min: number; max: number } {
  if (rows.length === 0) return { min: 0, max: 0 }
  const prices = rows.map((r) => r.price)
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

export function getChartTickTargets(zoom: AuctionHistoryZoom): { x: number; y: number } {
  return {
    x: Math.max(6, Math.min(20, Math.round(6 + (zoom - 1) * 1.6))),
    y: Math.max(3, Math.min(7, Math.round(3 + (zoom - 1) * 0.35))),
  }
}
