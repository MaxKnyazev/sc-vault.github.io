import { create } from 'zustand'

type AuctionHistoryItemModalState = {
  opened: boolean
  itemId: string | null
  open: (itemId: string) => void
  close: () => void
}

export const useAuctionHistoryItemModalStore = create<AuctionHistoryItemModalState>((set) => ({
  opened: false,
  itemId: null,
  open: (itemId) => set({ opened: true, itemId }),
  close: () => set({ opened: false, itemId: null }),
}))

