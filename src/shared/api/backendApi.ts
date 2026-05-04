import { getBackendApiBaseUrl, getBackendAuthToken } from '../config/backendApi'
import type { AuctionAgg24h } from './stalcraftAuction'

type AuctionStatsResponse = {
  items?: Record<string, AuctionAgg24h>
}

type AuctionBlacklistResponse = {
  itemIds?: string[]
}

type TrackedAuctionItemsResponse = {
  itemIds?: string[]
}

type TrackedDesiredBuyPricesResponse = {
  prices?: Record<string, { value?: string }>
}
type ResolveItemByNameResponse = {
  itemId?: string
}

export type AuctionHistoryRange = '30m' | '1h' | '12h' | '24h' | '7d' | '30d' | '90d'
export type AuctionHistoryZoom = 1 | 2 | 4
export type AuctionHistoryUpgrade = 'all' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15
export type AuctionHistoryQuality =
  | 'all'
  | 'normal'
  | 'uncommon'
  | 'special'
  | 'rare'
  | 'exclusive'
  | 'legendary'
  | 'unique'
  | 'unknown'
export type AuctionHistoryPoint = {
  ts: string
  avgPerUnit: number | null
  totalQty: number
  totalRevenue: number
  tradeCount: number
}
export type AuctionActiveLot = {
  amount: number
  price: number
  startPrice: number | null
  buyoutPrice: number | null
  placedAt: string
  expiresAt: string
  quality: AuctionHistoryQuality
  upgrade: number
  additional?: Record<string, unknown> | null
}
type AuctionHistoryResponse = {
  itemId?: string
  range?: AuctionHistoryRange
  quality?: AuctionHistoryQuality
  zoom?: AuctionHistoryZoom
  upgrade?: AuctionHistoryUpgrade
  points?: AuctionHistoryPoint[]
}
type AuctionActiveLotsResponse = {
  itemId?: string
  lots?: AuctionActiveLot[]
}

type UserBuyPricesResponse = {
  prices?: Record<string, { value?: string }>
  energyBuyPrice?: string
  /** Только для admin: глобальные дефолты по предметам */
  defaults?: Record<string, { value?: string }>
}

export type FetchUserBuyPricesResult = {
  itemPrices: Record<string, string>
  energyBuyPrice: string
  defaultPrices: Record<string, string>
}

export type RecipeResultOverride = {
  recipeId: string
  resultItemId: string
  baseAmount: number | null
  bonusAmount: number | null
  updatedAt?: string
}

type RecipeResultOverridesResponse = {
  items?: Record<string, RecipeResultOverride>
}

export type UserRole = 'blocked' | 'user' | 'admin'
export type CraftBranchLevels = {
  ammo: number
  pyrotechnics: number
  protectiveGear: number
  engineering: number
  cooking: number
  moonshining: number
  rawMaterials: number
  medicine: number
}

export type AuthUser = {
  id: number
  nickname: string
  role: UserRole
  avatarUrl?: string | null
  timezoneOffsetHours: number
  craftBranchLevels: CraftBranchLevels
}

export type AdminUser = {
  id: number
  nickname: string
  role: UserRole
  avatarUrl?: string | null
  createdAt: string
}

type AuthResponse = {
  token?: string
  user?: AuthUser
}
type UpdateOwnProfileResponse = {
  ok?: boolean
  user?: AuthUser
}

type AdminUsersResponse = {
  items?: AdminUser[]
}

export class BackendApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'BackendApiError'
    this.status = status
  }
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
    throw new BackendApiError(msg, response.status)
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

export async function fetchAuctionBlacklist(): Promise<string[]> {
  const url = buildApiUrl('/auction/blacklist')
  const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
  const payload = await parseJsonOrThrow<AuctionBlacklistResponse>(response)
  return payload.itemIds ?? []
}

export async function addAuctionBlacklistItem(itemId: string): Promise<void> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация администратора')
  const url = buildApiUrl('/auction-blacklist/add')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
    body: JSON.stringify({ itemId }),
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
}

export async function removeAuctionBlacklistItem(itemId: string): Promise<void> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация администратора')
  const url = buildApiUrl('/auction-blacklist/remove')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
    body: JSON.stringify({ itemId }),
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
}

export type TrackedAuctionScope = 'mine' | 'global'

export async function fetchTrackedAuctionItems(scope: TrackedAuctionScope = 'mine'): Promise<string[]> {
  const token = getBackendAuthToken()
  if (!token) return []
  const url = buildApiUrl(`/auction/tracked-items?scope=${encodeURIComponent(scope)}`)
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
  })
  const payload = await parseJsonOrThrow<TrackedAuctionItemsResponse>(response)
  return payload.itemIds ?? []
}

export async function addTrackedAuctionItem(itemId: string): Promise<void> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация')
  const url = buildApiUrl('/auction/tracked-items/add')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
    body: JSON.stringify({ itemId }),
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
}

export async function resolveAuctionItemIdByExactName(name: string): Promise<string> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация')
  const normalized = name.trim()
  if (!normalized) throw new Error('Введите название предмета')
  const url = buildApiUrl(`/auction/resolve-item-by-name?name=${encodeURIComponent(normalized)}`)
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
  })
  const payload = await parseJsonOrThrow<ResolveItemByNameResponse>(response)
  const itemId = (payload.itemId ?? '').trim()
  if (!itemId) throw new Error('Не удалось определить ID предмета')
  return itemId
}

export async function fetchAuctionItemHistory(
  itemId: string,
  range: AuctionHistoryRange,
  quality: AuctionHistoryQuality = 'all',
  zoom: AuctionHistoryZoom = 1,
  upgrade: AuctionHistoryUpgrade = 'all',
): Promise<AuctionHistoryPoint[]> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация')
  const url = buildApiUrl(
    `/auction/history?itemId=${encodeURIComponent(itemId)}&range=${encodeURIComponent(range)}&quality=${encodeURIComponent(quality)}&zoom=${encodeURIComponent(String(zoom))}&upgrade=${encodeURIComponent(String(upgrade))}`,
  )
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
  })
  const payload = await parseJsonOrThrow<AuctionHistoryResponse>(response)
  return payload.points ?? []
}

export async function fetchAuctionItemActiveLots(itemId: string, limit = 100): Promise<AuctionActiveLot[]> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация')
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)))
  const url = buildApiUrl(
    `/auction/active-lots?itemId=${encodeURIComponent(itemId)}&limit=${encodeURIComponent(String(safeLimit))}`,
  )
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
  })
  const payload = await parseJsonOrThrow<AuctionActiveLotsResponse>(response)
  return payload.lots ?? []
}

export async function removeTrackedAuctionItem(
  itemId: string,
  scope: 'my' | 'global' = 'my',
): Promise<void> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация')
  const url = buildApiUrl('/auction/tracked-items/remove')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
    body: JSON.stringify({ itemId, scope }),
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
}

export async function fetchTrackedDesiredBuyPrices(): Promise<Record<string, string>> {
  const token = getBackendAuthToken()
  if (!token) return {}
  const url = buildApiUrl('/auction/tracked-desired-buy-prices')
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
  })
  const payload = await parseJsonOrThrow<TrackedDesiredBuyPricesResponse>(response)
  return parseBuyPricesPayload(payload.prices)
}

export async function saveTrackedDesiredBuyPrice(itemId: string, value: string): Promise<void> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация')
  const url = buildApiUrl('/auction/tracked-desired-buy-prices')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
    body: JSON.stringify({ itemId, value }),
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
}

export async function fetchBackendUserBuyPrices(): Promise<FetchUserBuyPricesResult> {
  const token = getBackendAuthToken()
  if (!token) return { itemPrices: {}, energyBuyPrice: '', defaultPrices: {} }
  const url = buildApiUrl('/user/buy-prices')
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
  })
  const payload = await parseJsonOrThrow<UserBuyPricesResponse>(response)
  return {
    itemPrices: parseBuyPricesPayload(payload.prices),
    energyBuyPrice: typeof payload.energyBuyPrice === 'string' ? payload.energyBuyPrice : '',
    defaultPrices: parseBuyPricesPayload(payload.defaults),
  }
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
      'X-Auth-Token': token,
    },
    body: JSON.stringify({ itemId, value }),
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
}

export async function saveBackendUserEnergyBuyPrice(value: string): Promise<void> {
  const token = getBackendAuthToken()
  if (!token) return
  const url = buildApiUrl('/user/energy-buy-price')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
    body: JSON.stringify({ value }),
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
}

/** Сохранение дефолтной цены скупа для всех (только admin). Идёт в `/user/buy-prices`, чтобы не зависеть от пути `/admin/*` на прокси. */
export async function saveBackendUserDefaultBuyPrice(itemId: string, value: string): Promise<void> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация')
  const url = buildApiUrl('/user/buy-prices')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
    body: JSON.stringify({ itemId, value, defaultForAll: true }),
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
}

function parseBuyPricesPayload(prices: UserBuyPricesResponse['prices']): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [itemId, row] of Object.entries(prices ?? {})) {
    result[itemId] = typeof row?.value === 'string' ? row.value : ''
  }
  return result
}

export async function loginBackendUser(nickname: string, password: string): Promise<AuthResponse> {
  const url = buildApiUrl('/auth/login')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ nickname, password }),
  })
  return parseJsonOrThrow<AuthResponse>(response)
}

export async function registerBackendUser(nickname: string, password: string): Promise<AuthResponse> {
  const url = buildApiUrl('/auth/register')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ nickname, password }),
  })
  return parseJsonOrThrow<AuthResponse>(response)
}

export async function fetchBackendMe(token: string): Promise<AuthUser> {
  const url = buildApiUrl('/auth/me')
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
  })
  const payload = await parseJsonOrThrow<{ user?: AuthUser }>(response)
  if (!payload.user) throw new Error('Пользователь не найден')
  return payload.user
}

export async function logoutBackendUser(token: string): Promise<void> {
  const url = buildApiUrl('/auth/logout')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
}

export async function updateOwnProfile(input: {
  timezoneOffsetHours: number
  craftBranchLevels: CraftBranchLevels
}): Promise<AuthUser> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация')
  const url = buildApiUrl('/user/profile')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
    body: JSON.stringify(input),
  })
  const payload = await parseJsonOrThrow<UpdateOwnProfileResponse>(response)
  if (!payload.user) throw new Error('Профиль не получен после сохранения')
  return payload.user
}

export async function fetchRecipeResultOverrides(): Promise<Record<string, RecipeResultOverride>> {
  const url = buildApiUrl('/recipe-overrides')
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  const payload = await parseJsonOrThrow<RecipeResultOverridesResponse>(response)
  return payload.items ?? {}
}

export async function saveRecipeResultOverride(
  override: Omit<RecipeResultOverride, 'updatedAt'>,
): Promise<void> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация администратора')

  const url = buildApiUrl('/recipe-overrides/save')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
    body: JSON.stringify(override),
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
}

export async function bulkSaveRecipeResultOverrides(
  items: Array<Omit<RecipeResultOverride, 'updatedAt'>>,
): Promise<number> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация администратора')
  const url = buildApiUrl('/recipe-overrides/bulk-save')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
    body: JSON.stringify({ items }),
  })
  const payload = await parseJsonOrThrow<{ updated?: number }>(response)
  return payload.updated ?? 0
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация администратора')
  const url = buildApiUrl('/users-admin/list')
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
  })
  const payload = await parseJsonOrThrow<AdminUsersResponse>(response)
  return payload.items ?? []
}

export async function updateAdminUser(input: {
  id: number
  nickname: string
  role: UserRole
}): Promise<void> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация администратора')
  const url = buildApiUrl('/users-admin/update')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
    body: JSON.stringify(input),
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
}

export async function deleteAdminUser(id: number): Promise<void> {
  const token = getBackendAuthToken()
  if (!token) throw new Error('Нужна авторизация администратора')
  const url = buildApiUrl('/users-admin/delete')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Auth-Token': token,
    },
    body: JSON.stringify({ id }),
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
}

