import { create } from 'zustand'
import {
  deleteTrackedItemSubscription,
  fetchTrackedItemSubscriptions,
  upsertTrackedItemSubscription,
  type TrackedItemSubscription,
} from '../api/backendApi'
import { getBackendApiBaseUrl, getBackendAuthToken } from '../config/backendApi'
import { useAuctionTrackedLotsStore } from './auctionTrackedLotsStore'

type State = {
  subscriptions: TrackedItemSubscription[]
  isLoading: boolean
  error: string | null
  reset: () => void
  loadRemote: () => Promise<void>
  upsert: (sub: TrackedItemSubscription) => Promise<void>
  remove: (sub: Pick<TrackedItemSubscription, 'itemId' | 'kind' | 'quality' | 'upgradeMin' | 'upgradeMax'>) => Promise<void>
}

export const useAuctionTrackedSubscriptionsStore = create<State>((set, get) => ({
  subscriptions: [],
  isLoading: false,
  error: null,
  reset: () => set({ subscriptions: [], isLoading: false, error: null }),
  loadRemote: async () => {
    if (!getBackendApiBaseUrl() || !getBackendAuthToken()) {
      set({ subscriptions: [], isLoading: false, error: null })
      return
    }
    set({ isLoading: true, error: null })
    try {
      const subscriptions = await fetchTrackedItemSubscriptions()
      set({ subscriptions, isLoading: false })
      useAuctionTrackedLotsStore.getState().bumpPoll()
    } catch (e) {
      set({
        subscriptions: [],
        isLoading: false,
        error: e instanceof Error ? e.message : 'Не удалось загрузить подписки',
      })
    }
  },
  upsert: async (sub) => {
    await upsertTrackedItemSubscription(sub)
    await get().loadRemote()
  },
  remove: async (sub) => {
    await deleteTrackedItemSubscription(sub)
    await get().loadRemote()
  },
}))
