import { getBackendApiBaseUrl, getBackendAuthToken } from '../config/backendApi'
import type { AuctionAgg24h } from './stalcraftAuction'

type AuctionStatsResponse = {
  items?: Record<string, AuctionAgg24h>
}

type UserBuyPricesResponse = {
  prices?: Record<string, { value?: string }>
}

function buildApiUrl(path: string): string {
  const base = getBackendApiBaseUrl()
  if (!base) throw new Error('Не задан VITE_BACKEND_API_BASE_URL')
  return `${base.replace(/\/$/, '')}${path}`
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const text = await response.text()
  let data: unknown = {}
  if (text.trim() !== '') {
    data = JSON.parse(text) as unknown
  }
  if (!response.ok) {
    const msg = typeof data === 'object' && data && 'error' in data ? String((data as { error: unknown }).error) : `Backend API ${response.status}`
    throw new Error(msg)
  }
  return data as T
}

export async function fetchBackendAuctionStats(itemIds: string[]): Promise<Record<string, AuctionAgg24h>> {
  const ids = [...new Set(itemIds)].filter(Boolean)
  if (!ids.length) return {}
  const url = buildApiUrl(`/auction/stats?ids=${encodeURIComponent(ids.join(','))}`)
  const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
  const payload = await parseJsonOrThrow<AuctionStatsResponse>(response)
  return payload.items ?? {}
}

export async function fetchBackendUserBuyPrices(): Promise<Record<string, string>> {
  const token = getBackendAuthToken()
  if (!token) return {}
  const url = buildApiUrl('/user/buy-prices')
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  const payload = await parseJsonOrThrow<UserBuyPricesResponse>(response)
  const result: Record<string, string> = {}
  for (const [itemId, row] of Object.entries(payload.prices ?? {})) {
    result[itemId] = typeof row?.value === 'string' ? row.value : ''
  }
  return result
}

export async function saveBackendUserBuyPrice(itemId: string, value: string): Promise<void> {
  const token = getBackendAuthToken()
  if (!token) return
  const url = buildApiUrl('/user/buy-prices')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ itemId, value }),
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
}

