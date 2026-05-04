import { create } from 'zustand'

export type AuctionHistoryModalView = 'history' | 'activeLots'

type AuctionHistoryItemModalState = {
  opened: boolean
  itemId: string | null
  initialView: AuctionHistoryModalView
  open: (itemId: string, options?: { initialView?: AuctionHistoryModalView }) => void
  close: () => void
}

export const useAuctionHistoryItemModalStore = create<AuctionHistoryItemModalState>((set) => ({
  opened: false,
  itemId: null,
  initialView: 'history',
  open: (itemId, options) =>
    set({
      opened: true,
      itemId,
      initialView: options?.initialView ?? 'history',
    }),
  close: () =>
    set({
      opened: false,
      itemId: null,
      initialView: 'history',
    }),
}))
