import { create } from 'zustand'
import { addAuctionBlacklistItem, fetchAuctionBlacklist } from '../api/backendApi'

type AuctionBlacklistState = {
  blacklist: Set<string>
  isLoaded: boolean
  load: () => Promise<void>
  ensureLoaded: () => Promise<void>
  add: (itemId: string) => Promise<void>
  isBlacklisted: (itemId: string) => boolean
}

export const useAuctionBlacklistStore = create<AuctionBlacklistState>((set, get) => ({
  blacklist: new Set(),
  isLoaded: false,

  load: async () => {
    try {
      const ids = await fetchAuctionBlacklist()
      set({ blacklist: new Set(ids), isLoaded: true })
    } catch {
      set({ isLoaded: true })
    }
  },

  ensureLoaded: async () => {
    if (get().isLoaded) return
    await get().load()
  },

  add: async (itemId: string) => {
    await addAuctionBlacklistItem(itemId)
    set((state) => {
      const next = new Set(state.blacklist)
      next.add(itemId)
      return { blacklist: next, isLoaded: true }
    })
  },

  isBlacklisted: (itemId: string) => get().blacklist.has(itemId),
}))
