import { create } from 'zustand'
import {
  deleteVirtualTracking,
  fetchVirtualTrackings,
  type VirtualTracking,
  upsertVirtualTracking,
} from '../api/backendApi'
import { getBackendApiBaseUrl, getBackendAuthToken } from '../config/backendApi'

type AuctionVirtualTrackingsState = {
  trackings: VirtualTracking[]
  isLoading: boolean
  error: string | null
  reset: () => void
  loadRemote: () => Promise<void>
  upsert: (tracking: VirtualTracking) => Promise<void>
  remove: (tracking: Pick<VirtualTracking, 'kind' | 'quality' | 'upgradeMin' | 'upgradeMax'>) => Promise<void>
}

export const useAuctionVirtualTrackingsStore = create<AuctionVirtualTrackingsState>((set, get) => ({
  trackings: [],
  isLoading: false,
  error: null,
  reset: () => set({ trackings: [], isLoading: false, error: null }),
  loadRemote: async () => {
    if (!getBackendApiBaseUrl() || !getBackendAuthToken()) {
      set({ trackings: [], isLoading: false, error: null })
      return
    }
    set({ isLoading: true, error: null })
    try {
      const trackings = await fetchVirtualTrackings()
      set({ trackings, isLoading: false })
    } catch (e) {
      set({ trackings: [], isLoading: false, error: e instanceof Error ? e.message : 'Не удалось загрузить подписки' })
    }
  },
  upsert: async (tracking) => {
    await upsertVirtualTracking(tracking)
    await get().loadRemote()
  },
  remove: async (tracking) => {
    await deleteVirtualTracking(tracking)
    await get().loadRemote()
  },
}))

