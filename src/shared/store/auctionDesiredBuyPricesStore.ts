import { create } from 'zustand'
import {
  fetchTrackedDesiredBuyPrices,
  saveTrackedDesiredBuyPrice,
} from '../api/backendApi'
import { getBackendApiBaseUrl, getBackendAuthToken } from '../config/backendApi'
import { useAuctionTrackedLotsStore } from './auctionTrackedLotsStore'

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const SAVE_DEBOUNCE_MS = 500

type AuctionDesiredBuyPricesState = {
  desiredBuyByItemId: Record<string, string>
  loadRemote: () => Promise<void>
  reset: () => void
  setDesiredBuyPrice: (itemId: string, value: string) => void
}

function schedulePersist(itemId: string, value: string): void {
  const prev = saveTimers.get(itemId)
  if (prev !== undefined) window.clearTimeout(prev)
  saveTimers.set(
    itemId,
    window.setTimeout(() => {
      saveTimers.delete(itemId)
      if (!getBackendApiBaseUrl() || !getBackendAuthToken()) return
      void saveTrackedDesiredBuyPrice(itemId, value).catch(() => {
        // оставляем локальное значение; повтор при следующем сохранении
      })
    }, SAVE_DEBOUNCE_MS),
  )
}

export const useAuctionDesiredBuyPricesStore = create<AuctionDesiredBuyPricesState>((set) => ({
  desiredBuyByItemId: {},
  reset: () => {
    for (const t of saveTimers.values()) window.clearTimeout(t)
    saveTimers.clear()
    set({ desiredBuyByItemId: {} })
  },
  loadRemote: async () => {
    if (!getBackendApiBaseUrl() || !getBackendAuthToken()) {
      set({ desiredBuyByItemId: {} })
      return
    }
    try {
      const prices = await fetchTrackedDesiredBuyPrices()
      set({ desiredBuyByItemId: prices })
      useAuctionTrackedLotsStore.getState().bumpPoll()
    } catch {
      set({ desiredBuyByItemId: {} })
    }
  },
  setDesiredBuyPrice: (itemId, value) => {
    set((state) => ({
      desiredBuyByItemId: {
        ...state.desiredBuyByItemId,
        [itemId]: value,
      },
    }))
    schedulePersist(itemId, value)
  },
}))
