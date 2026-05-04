import { create } from 'zustand'
import type { AuctionActiveLot } from '../api/backendApi'

type AuctionTrackedLotsState = {
  lotsByItemId: Record<string, AuctionActiveLot[]>
  pollTick: number
  replaceLotsForTracked: (next: Record<string, AuctionActiveLot[]>) => void
  clearLots: () => void
  bumpPoll: () => void
}

export const useAuctionTrackedLotsStore = create<AuctionTrackedLotsState>((set) => ({
  lotsByItemId: {},
  pollTick: 0,
  replaceLotsForTracked: (next) => set({ lotsByItemId: next }),
  clearLots: () => set({ lotsByItemId: {} }),
  bumpPoll: () => set((s) => ({ pollTick: s.pollTick + 1 })),
}))
