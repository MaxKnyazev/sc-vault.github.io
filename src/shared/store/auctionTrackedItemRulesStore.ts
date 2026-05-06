import { create } from 'zustand'
import { fetchTrackedItemRules, saveTrackedItemRules, type TrackedItemRule } from '../api/backendApi'
import { getBackendApiBaseUrl, getBackendAuthToken } from '../config/backendApi'
import { useAuctionTrackedLotsStore } from './auctionTrackedLotsStore'

export type AuctionTrackedItemRule = TrackedItemRule

type AuctionTrackedItemRulesState = {
  rulesByItemId: Record<string, AuctionTrackedItemRule>
  reset: () => void
  loadRemote: () => Promise<void>
  saveRules: (itemId: string, qualities: string[], upgrades: Array<number | null>) => Promise<void>
}

export const useAuctionTrackedItemRulesStore = create<AuctionTrackedItemRulesState>((set) => ({
  rulesByItemId: {},
  reset: () => set({ rulesByItemId: {} }),
  loadRemote: async () => {
    if (!getBackendApiBaseUrl() || !getBackendAuthToken()) {
      set({ rulesByItemId: {} })
      return
    }
    try {
      const rulesByItemId = await fetchTrackedItemRules()
      set({ rulesByItemId })
      useAuctionTrackedLotsStore.getState().bumpPoll()
    } catch {
      set({ rulesByItemId: {} })
    }
  },
  saveRules: async (itemId, qualities, upgrades) => {
    await saveTrackedItemRules(itemId, qualities, upgrades)
    // refresh to keep server as source of truth (and normalize order)
    const rulesByItemId = await fetchTrackedItemRules()
    set({ rulesByItemId })
    useAuctionTrackedLotsStore.getState().bumpPoll()
  },
}))

