import { create } from 'zustand'
import type { AuctionHistoryQuality } from '../api/backendApi'

export type AuctionHistoryModalView = 'history' | 'activeLots'

type AuctionHistoryItemModalState = {
  opened: boolean
  itemId: string | null
  initialView: AuctionHistoryModalView
  initialQuality: AuctionHistoryQuality | null
  open: (
    itemId: string,
    options?: { initialView?: AuctionHistoryModalView; initialQuality?: AuctionHistoryQuality | null },
  ) => void
  close: () => void
}

export const useAuctionHistoryItemModalStore = create<AuctionHistoryItemModalState>((set) => ({
  opened: false,
  itemId: null,
  initialView: 'history',
  initialQuality: null,
  open: (itemId, options) =>
    set({
      opened: true,
      itemId,
      initialView: options?.initialView ?? 'history',
      initialQuality: options?.initialQuality ?? null,
    }),
  close: () =>
    set({
      opened: false,
      itemId: null,
      initialView: 'history',
      initialQuality: null,
    }),
}))
