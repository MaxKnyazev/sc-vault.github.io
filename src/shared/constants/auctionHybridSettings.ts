import type { AuctionHybridSettings } from '../api/backendApi'

export const HYBRID_LAST_SALES_OPTIONS: Array<{
  value: AuctionHybridSettings['lastSalesCount']
  label: string
}> = [
  { value: 50, label: '50 продаж' },
  { value: 100, label: '100 продаж' },
  { value: 200, label: '200 продаж' },
  { value: 500, label: '500 продаж' },
  { value: 1000, label: '1000 продаж' },
]

export const HYBRID_TIME_WINDOW_OPTIONS: Array<{
  value: AuctionHybridSettings['timeWindow']
  label: string
}> = [
  { value: '1h', label: '1 час' },
  { value: '6h', label: '6 часов' },
  { value: '12h', label: '12 часов' },
  { value: '24h', label: '24 часа' },
]
