import { getBackendApiBaseUrl, getBackendAuthToken } from '../config/backendApi'
import type { AuctionAgg24h } from './stalcraftAuction'

type AuctionStatsResponse = {
  items?: Record<string, AuctionAgg24h>
}

type AuctionBlacklistResponse = {
  itemIds?: string[]
}

type UserBuyPricesResponse = {
  prices?: Record<string, { value?: string }>
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

export type AuthUser = {
  id: number
  nickname: string
  role: UserRole
  avatarUrl?: string | null
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

export async function fetchBackendUserBuyPrices(): Promise<Record<string, string>> {
  const token = getBackendAuthToken()
  if (!token) return {}
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
      'X-Auth-Token': token,
    },
    body: JSON.stringify({ itemId, value }),
  })
  await parseJsonOrThrow<{ ok?: boolean }>(response)
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

