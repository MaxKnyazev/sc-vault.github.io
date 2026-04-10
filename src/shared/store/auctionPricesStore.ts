import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuctionAgg24h } from '../api/stalcraftAuction'
import { aggregateAuctionPurchases24h } from '../api/stalcraftAuction'
import { fetchBackendAuctionStats } from '../api/backendApi'
import { getBackendApiBaseUrl } from '../config/backendApi'
import { getStalcraftAuctionRefreshConcurrency } from '../config/stalcraftApi'
import { useAuctionBlacklistStore } from './auctionBlacklistStore'

function formatAuctionFailures(
  failed: { itemId: string; message: string }[],
  total: number,
): string {
  const n = failed.length
  const header = `Не удалось обновить ${n} из ${total} предметов.`
  if (n === 0) return header

  const byMessage = new Map<string, string[]>()
  for (const { itemId, message } of failed) {
    const list = byMessage.get(message)
    if (list) list.push(itemId)
    else byMessage.set(message, [itemId])
  }

  const blocks: string[] = []
  for (const [message, ids] of byMessage) {
    const sorted = [...ids].sort()
    const maxIds = 40
    const shown = sorted.slice(0, maxIds)
    const more = sorted.length > maxIds ? ` … (+${sorted.length - maxIds})` : ''
    blocks.push(`${message}\n  ID: ${shown.join(', ')}${more}`)
  }

  return `${header}\n\n${blocks.join('\n\n')}`
}

type AuctionPricesState = {
  byItemId: Record<string, AuctionAgg24h>
  isRefreshing: boolean
  error: string | null
  progress: { done: number; total: number } | null
  refreshAll: (itemIds: string[]) => Promise<void>
  clearCache: () => void
  removeItemFromCache: (itemId: string) => void
  resetError: () => void
}

export const useAuctionPricesStore = create<AuctionPricesState>()(
  persist(
    (set, get) => ({
      byItemId: {},
      isRefreshing: false,
      error: null,
      progress: null,
      clearCache: () => {
        set({ byItemId: {}, error: null, progress: null, isRefreshing: false })
      },
      resetError: () => set({ error: null }),
      removeItemFromCache: (itemId: string) => {
        set((state) => {
          const next = { ...state.byItemId }
          delete next[itemId]
          return { byItemId: next }
        })
      },
      refreshAll: async (itemIds) => {
        const unique = [...new Set(itemIds)].filter(Boolean).sort()
        if (!unique.length) return

        await useAuctionBlacklistStore.getState().ensureLoaded()
        const isBl = useAuctionBlacklistStore.getState().isBlacklisted
        const tracked = unique.filter((id) => !isBl(id))
        const baseByItemId = { ...get().byItemId }
        for (const id of unique) {
          if (isBl(id)) delete baseByItemId[id]
        }

        if (!tracked.length) {
          set({ byItemId: baseByItemId, isRefreshing: false, error: null, progress: null })
          return
        }

        set({
          isRefreshing: true,
          error: null,
          progress: { done: 0, total: tracked.length },
        })

        const nextByItemId = { ...baseByItemId }
        const failed: { itemId: string; message: string }[] = []

        try {
          // Preferred path: one bulk request to backend API.
          if (getBackendApiBaseUrl()) {
            try {
              const stats = await fetchBackendAuctionStats(tracked)
              for (const id of tracked) {
                const row = stats[id]
                if (row) nextByItemId[id] = row
              }
              set({
                byItemId: { ...nextByItemId },
                isRefreshing: false,
                progress: null,
                error: null,
              })
              return
            } catch (err) {
              const message =
                err instanceof Error
                  ? `Backend API: ${err.message}`
                  : 'Backend API: auction stats unavailable'
              set({
                isRefreshing: false,
                progress: null,
                error: message,
              })
              return
            }
          }

          const concurrency = getStalcraftAuctionRefreshConcurrency()
          const queue = [...tracked]
          let done = 0

          const worker = async () => {
            while (queue.length > 0) {
              const itemId = queue.shift()
              if (!itemId) break
              try {
                const agg = await aggregateAuctionPurchases24h(itemId)
                nextByItemId[itemId] = agg
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                failed.push({ itemId, message })
              } finally {
                done += 1
                set({
                  byItemId: { ...nextByItemId },
                  progress: { done, total: tracked.length },
                })
              }
            }
          }

          const workers = Array.from(
            { length: Math.min(concurrency, tracked.length) },
            () => worker(),
          )
          await Promise.all(workers)

          set({
            isRefreshing: false,
            progress: null,
            error: failed.length ? formatAuctionFailures(failed, tracked.length) : null,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Auction refresh failed'
          set({ error: message, isRefreshing: false, progress: null })
        }
      },
    }),
    {
      name: 'sc-vault-auction-prices-12h',
      // Не сохранять состояние «идёт обновление» — при F5 во время запроса иначе
      // из localStorage поднимается isRefreshing: true без активного refreshAll.
      partialize: (state) => ({ byItemId: state.byItemId }),
      merge: (persistedState, currentState) => {
        const p = persistedState as Partial<AuctionPricesState> | null
        if (!p || typeof p !== 'object') return currentState
        return {
          ...currentState,
          ...p,
          isRefreshing: false,
          progress: null,
        }
      },
    },
  ),
)
