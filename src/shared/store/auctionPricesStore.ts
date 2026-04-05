import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuctionAgg24h } from '../api/stalcraftAuction'
import { aggregateAuctionPurchases24h } from '../api/stalcraftAuction'
import { getStalcraftAuctionRefreshConcurrency } from '../config/stalcraftApi'

type AuctionPricesState = {
  byItemId: Record<string, AuctionAgg24h>
  isRefreshing: boolean
  error: string | null
  progress: { done: number; total: number } | null
  refreshAll: (itemIds: string[]) => Promise<void>
  resetError: () => void
}

export const useAuctionPricesStore = create<AuctionPricesState>()(
  persist(
    (set, get) => ({
      byItemId: {},
      isRefreshing: false,
      error: null,
      progress: null,
      resetError: () => set({ error: null }),
      refreshAll: async (itemIds) => {
        const unique = [...new Set(itemIds)].filter(Boolean).sort()
        if (!unique.length) return

        set({
          isRefreshing: true,
          error: null,
          progress: { done: 0, total: unique.length },
        })

        const nextByItemId = { ...get().byItemId }
        const failed: string[] = []

        try {
          const concurrency = getStalcraftAuctionRefreshConcurrency()
          const queue = [...unique]
          let done = 0

          const worker = async () => {
            while (queue.length > 0) {
              const itemId = queue.shift()
              if (!itemId) break
              try {
                const agg = await aggregateAuctionPurchases24h(itemId)
                nextByItemId[itemId] = agg
              } catch {
                failed.push(itemId)
              } finally {
                done += 1
                set({
                  byItemId: { ...nextByItemId },
                  progress: { done, total: unique.length },
                })
              }
            }
          }

          const workers = Array.from(
            { length: Math.min(concurrency, unique.length) },
            () => worker(),
          )
          await Promise.all(workers)

          set({
            isRefreshing: false,
            progress: null,
            error: failed.length ? `Не удалось обновить ${failed.length} предметов` : null,
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
