import {
  getStalcraftApiBaseUrl,
  getStalcraftApiClientId,
  getStalcraftApiClientSecret,
  getStalcraftApiToken,
  getStalcraftAuctionRegion,
} from '../config/stalcraftApi'

export type AuctionHistoryPriceRow = {
  amount: number
  price: number
  time: string
  additional?: unknown
}

export type AuctionHistoryResponse = {
  prices?: AuctionHistoryPriceRow[]
}

export type AuctionAgg24h = {
  avgPerUnit: number | null
  totalQty: number
  totalRevenue: number
  tradeCount: number
  fetchedAt: string
}

const HISTORY_LIMIT = 100
const WINDOW_MS = 12 * 60 * 60 * 1000
/** Cap pages per item to limit load; liquid items may hit this before the full window is scanned. */
const MAX_PAGES_PER_ITEM = 40
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])
const RETRY_DELAYS_MS = [250, 600, 1200]

function buildAuctionHistoryUrl(itemId: string): URL {
  const base = getStalcraftApiBaseUrl().replace(/\/$/, '')
  const region = getStalcraftAuctionRegion()
  const path = `${base}/${region}/auction/${encodeURIComponent(itemId)}/history`

  if (/^https?:\/\//i.test(base)) {
    return new URL(path)
  }

  const origin =
    typeof globalThis !== 'undefined' && 'location' in globalThis && globalThis.location
      ? globalThis.location.origin
      : 'http://localhost:5173'

  return new URL(path, origin)
}

export async function fetchAuctionHistoryPage(
  itemId: string,
  offset: number,
  signal?: AbortSignal,
): Promise<AuctionHistoryResponse> {
  const token = getStalcraftApiToken()
  const clientId = getStalcraftApiClientId()
  const clientSecret = getStalcraftApiClientSecret()
  if (!token && !(clientId && clientSecret)) {
    throw new Error(
      'Не заданы креды STALCRAFT API: укажите в левой панели Client ID и Client Secret, либо в .env — VITE_STALCRAFT_API_TOKEN или пару VITE_STALCRAFT_API_CLIENT_ID + VITE_STALCRAFT_API_CLIENT_SECRET.',
    )
  }

  const url = buildAuctionHistoryUrl(itemId)
  url.searchParams.set('offset', String(offset))
  url.searchParams.set('limit', String(HISTORY_LIMIT))
  url.searchParams.set('additional', 'false')

  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(clientId && clientSecret ? { 'Client-Id': clientId, 'Client-Secret': clientSecret } : {}),
    Accept: 'application/json',
  }

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'GET', headers, signal })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error'
      const hint = import.meta.env.PROD
        ? ' На статическом хостинге (GitHub Pages) прямой вызов eapi часто блокируется CORS — укажите URL прокси в VITE_STALCRAFT_API_BASE_URL (см. infra/stalcraft-cors-proxy).'
        : ' Если это localhost, перезапустите dev-сервер после изменений прокси.'
      throw new Error(`Сеть/API недоступны (${message}).${hint}`)
    }

    const raw = await response.text()
    let parsed: AuctionHistoryResponse & { title?: string; status?: number; details?: unknown } = {}
    if (raw.trim().length > 0) {
      try {
        parsed = JSON.parse(raw) as typeof parsed
      } catch {
        throw new Error(
          `Auction history ${itemId}: ${response.status} ${raw.slice(0, 200) || 'invalid json'}`,
        )
      }
    }

    if (response.ok) {
      return parsed
    }

    if (response.status === 401) {
      throw new Error(
        'API Stalcraft: 401 Unauthorized — отклонены Client ID / Client Secret (или токен). Проверьте значения в левой панели и нажмите «Сохранить», либо переменные VITE_* в .env.',
      )
    }

    if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < RETRY_DELAYS_MS.length) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]!))
      continue
    }

    const msg =
      typeof parsed.title === 'string'
        ? parsed.title
        : `Auction history ${itemId}: ${response.status}`
    throw new Error(msg)
  }

  throw new Error(`Auction history ${itemId}: retry limit exceeded`)
}

export async function aggregateAuctionPurchases24h(
  itemId: string,
  signal?: AbortSignal,
): Promise<AuctionAgg24h> {
  const cutoff = Date.now() - WINDOW_MS
  let offset = 0
  let totalQty = 0
  let totalRevenue = 0
  let tradeCount = 0
  let pageCount = 0

  while (true) {
    const data = await fetchAuctionHistoryPage(itemId, offset, signal)
    const prices = data.prices ?? []
    if (prices.length === 0) break
    pageCount += 1

    let oldestInPage = Number.POSITIVE_INFINITY
    for (const row of prices) {
      const t = Date.parse(row.time)
      if (!Number.isFinite(t)) continue
      oldestInPage = Math.min(oldestInPage, t)
      if (t >= cutoff) {
        totalQty += row.amount
        totalRevenue += row.price
        tradeCount += 1
      }
    }

    const stopPaging =
      prices.length < HISTORY_LIMIT ||
      oldestInPage < cutoff ||
      !Number.isFinite(oldestInPage)

    if (stopPaging || pageCount >= MAX_PAGES_PER_ITEM) break
    offset += HISTORY_LIMIT
  }

  const fetchedAt = new Date().toISOString()
  if (totalQty <= 0) {
    return {
      avgPerUnit: null,
      totalQty: 0,
      totalRevenue: 0,
      tradeCount,
      fetchedAt,
    }
  }

  return {
    avgPerUnit: totalRevenue / totalQty,
    totalQty,
    totalRevenue,
    tradeCount,
    fetchedAt,
  }
}
