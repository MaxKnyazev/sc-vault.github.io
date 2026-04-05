import { useStalcraftCredentialsStore } from '../store/stalcraftCredentialsStore'

function readEnvString(key: string): string | undefined {
  const value = import.meta.env[key as keyof ImportMetaEnv]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function readBrowserClientId(): string | undefined {
  const v = useStalcraftCredentialsStore.getState().clientId
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

function readBrowserClientSecret(): string | undefined {
  const v = useStalcraftCredentialsStore.getState().clientSecret
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

export function getStalcraftApiBaseUrl(): string {
  const fromEnv = readEnvString('VITE_STALCRAFT_API_BASE_URL')
  if (fromEnv) return fromEnv
  return import.meta.env.DEV ? '/stalcraft-eapi' : 'https://eapi.stalcraft.net'
}

export function getStalcraftAuctionRegion(): string {
  return (readEnvString('VITE_STALCRAFT_AUCTION_REGION') ?? 'ru').toLowerCase()
}

export function getStalcraftApiToken(): string | undefined {
  return readEnvString('VITE_STALCRAFT_API_TOKEN')
}

export function getStalcraftApiClientId(): string | undefined {
  return readBrowserClientId() ?? readEnvString('VITE_STALCRAFT_API_CLIENT_ID')
}

export function getStalcraftApiClientSecret(): string | undefined {
  return readBrowserClientSecret() ?? readEnvString('VITE_STALCRAFT_API_CLIENT_SECRET')
}

/** Parallel item fetches during «Обновить цены аукциона». Clamped 1–16, default 6. */
export function getStalcraftAuctionRefreshConcurrency(): number {
  const raw = readEnvString('VITE_STALCRAFT_AUCTION_CONCURRENCY')
  if (!raw) return 6
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return 6
  return Math.min(16, Math.max(1, n))
}
