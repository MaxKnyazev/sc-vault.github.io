import type { AuctionActiveLot } from '../api/backendApi'

export function parseAuctionLotUtcDate(ts: string): Date | null {
  const normalized = ts.includes('T') ? ts : `${ts.replace(' ', 'T')}Z`
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return null
  return d
}

/** Минимальная цена за 1 ед. среди ещё не истёкших лотов; `null`, если таких нет. */
export function minActiveLotUnitPrice(lots: AuctionActiveLot[], nowMs: number): number | null {
  let min: number | null = null
  for (const lot of lots) {
    const end = parseAuctionLotUtcDate(lot.expiresAt)
    if (!end || end.getTime() <= nowMs) continue
    if (min === null || lot.price < min) min = lot.price
  }
  return min
}
