import { create } from 'zustand'
import type { AuctionHistoryQuality, AuctionHistoryUpgrade } from '../api/backendApi'

export type AuctionHistoryModalView = 'history' | 'activeLots'

type AuctionHistoryItemModalState = {
  opened: boolean
  itemId: string | null
  initialView: AuctionHistoryModalView
  initialQuality: AuctionHistoryQuality | null
  initialUpgrade: AuctionHistoryUpgrade | null
  open: (
    itemId: string,
    options?: {
      initialView?: AuctionHistoryModalView
      initialQuality?: AuctionHistoryQuality | null
      initialUpgrade?: AuctionHistoryUpgrade | null
    },
  ) => void
  close: () => void
}

export const useAuctionHistoryItemModalStore = create<AuctionHistoryItemModalState>((set) => ({
  opened: false,
  itemId: null,
  initialView: 'history',
  initialQuality: null,
  initialUpgrade: null,
  open: (itemId, options) =>
    set({
      opened: true,
      itemId,
      initialView: options?.initialView ?? 'history',
      initialQuality: options?.initialQuality ?? null,
      initialUpgrade: options?.initialUpgrade ?? null,
    }),
  close: () =>
    set({
      opened: false,
      itemId: null,
      initialView: 'history',
      initialQuality: null,
      initialUpgrade: null,
    }),
}))
