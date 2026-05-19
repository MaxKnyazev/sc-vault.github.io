import { create } from 'zustand'
import {
  fetchAuctionLiquidityValidity,
  type AuctionLiquidityBenchmark,
  type AuctionLiquidityItem,
} from '../api/backendApi'
import { getBackendApiBaseUrl } from '../config/backendApi'

type AuctionLiquidityState = {
  byItemId: Record<string, AuctionLiquidityItem>
  benchmark: AuctionLiquidityBenchmark | null
  lastFetchedAt: string | null
  isLoading: boolean
  error: string | null
  ensureForItems: (itemIds: string[], window?: string) => Promise<void>
  clear: () => void
}

const inFlight = new Map<string, Promise<void>>()

function requestKey(ids: string[], window: string): string {
  return `${window}::${[...ids].sort().join(',')}`
}

export const useAuctionLiquidityStore = create<AuctionLiquidityState>((set, get) => ({
  byItemId: {},
  benchmark: null,
  lastFetchedAt: null,
  isLoading: false,
  error: null,
  clear: () => set({ byItemId: {}, benchmark: null, lastFetchedAt: null, error: null, isLoading: false }),
  ensureForItems: async (itemIds, window = '12h') => {
    if (!getBackendApiBaseUrl()) return
    const unique = [...new Set(itemIds)].filter(Boolean)
    if (unique.length === 0) return

    const missing = unique.filter((id) => get().byItemId[id] === undefined)
    if (missing.length === 0) return

    const key = requestKey(missing, window)
    const existing = inFlight.get(key)
    if (existing) {
      await existing
      return
    }

    const run = (async () => {
      set({ isLoading: true, error: null })
      try {
        const payload = await fetchAuctionLiquidityValidity(missing, window)
        set((state) => ({
          byItemId: { ...state.byItemId, ...(payload.items ?? {}) },
          benchmark: payload.benchmark ?? state.benchmark,
          lastFetchedAt: payload.fetchedAt ?? new Date().toISOString(),
          isLoading: false,
          error: null,
        }))
      } catch (err) {
        set({
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })()

    inFlight.set(key, run)
    try {
      await run
    } finally {
      inFlight.delete(key)
    }
  },
}))
