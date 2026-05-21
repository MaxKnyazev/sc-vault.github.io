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

const FLUSH_DELAY_MS = 80
const pendingByWindow = new Map<string, Set<string>>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushWaiters: Array<() => void> = []

function scheduleFlush(get: () => AuctionLiquidityState, set: (partial: Partial<AuctionLiquidityState> | ((s: AuctionLiquidityState) => Partial<AuctionLiquidityState>)) => void): void {
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void runFlush(get, set)
  }, FLUSH_DELAY_MS)
}

async function runFlush(
  get: () => AuctionLiquidityState,
  set: (partial: Partial<AuctionLiquidityState> | ((s: AuctionLiquidityState) => Partial<AuctionLiquidityState>)) => void,
): Promise<void> {
  const waiters = flushWaiters
  flushWaiters = []

  if (!getBackendApiBaseUrl()) {
    waiters.forEach((r) => r())
    return
  }

  const batches: Array<{ window: string; ids: string[] }> = []
  for (const [window, bucket] of pendingByWindow) {
    pendingByWindow.delete(window)
    const ids = [...bucket].filter((id) => get().byItemId[id] === undefined)
    if (ids.length > 0) batches.push({ window, ids })
  }

  if (batches.length === 0) {
    waiters.forEach((r) => r())
    return
  }

  set({ isLoading: true, error: null })
  try {
    for (const { window, ids } of batches) {
      const payload = await fetchAuctionLiquidityValidity(ids, window)
      set((state) => ({
        byItemId: { ...state.byItemId, ...(payload.items ?? {}) },
        benchmark: payload.benchmark ?? state.benchmark,
        lastFetchedAt: payload.fetchedAt ?? new Date().toISOString(),
      }))
    }
    set({ isLoading: false, error: null })
  } catch (err) {
    set({
      isLoading: false,
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    waiters.forEach((r) => r())
  }
}

export const useAuctionLiquidityStore = create<AuctionLiquidityState>((set, get) => ({
  byItemId: {},
  benchmark: null,
  lastFetchedAt: null,
  isLoading: false,
  error: null,
  clear: () => {
    pendingByWindow.clear()
    flushWaiters = []
    if (flushTimer !== null) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    set({ byItemId: {}, benchmark: null, lastFetchedAt: null, error: null, isLoading: false })
  },
  ensureForItems: (itemIds, window = '12h') => {
    if (!getBackendApiBaseUrl()) return Promise.resolve()
    const unique = [...new Set(itemIds)].filter(Boolean)
    if (unique.length === 0) return Promise.resolve()

    const missing = unique.filter((id) => get().byItemId[id] === undefined)
    if (missing.length === 0) return Promise.resolve()

    const bucket = pendingByWindow.get(window) ?? new Set<string>()
    for (const id of missing) bucket.add(id)
    pendingByWindow.set(window, bucket)

    return new Promise<void>((resolve) => {
      flushWaiters.push(resolve)
      scheduleFlush(get, set)
    })
  },
}))
