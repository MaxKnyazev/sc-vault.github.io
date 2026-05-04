import { create } from 'zustand'
import { fetchTrackedDesiredBuyPrices, saveTrackedDesiredBuyPrice } from '../api/backendApi'
import { getBackendApiBaseUrl, getBackendAuthToken } from '../config/backendApi'
import { useAuctionTrackedLotsStore } from './auctionTrackedLotsStore'

type AuctionDesiredBuyPricesState = {
  desiredBuyByItemId: Record<string, string>
  loadRemote: () => Promise<void>
  reset: () => void
  /** Сохранить на сервер и обновить локальный снимок (после кнопки «Сохранить»). */
  saveDesiredBuyPrice: (itemId: string, value: string) => Promise<void>
}

export const useAuctionDesiredBuyPricesStore = create<AuctionDesiredBuyPricesState>((set) => ({
  desiredBuyByItemId: {},
  reset: () => {
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
  saveDesiredBuyPrice: async (itemId, value) => {
    const digits = value.replace(/[^\d]/g, '')
    await saveTrackedDesiredBuyPrice(itemId, digits)
    set((state) => ({
      desiredBuyByItemId: {
        ...state.desiredBuyByItemId,
        [itemId]: digits,
      },
    }))
    useAuctionTrackedLotsStore.getState().bumpPoll()
  },
}))
