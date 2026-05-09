import { create } from 'zustand'
import type { AuctionHistoryQuality, AuctionHistoryUpgrade } from '../api/backendApi'

export type AuctionDealToast = {
  id: string
  itemId: string
  name: string
  minPrice: number
  iconUrl?: string
  initialQuality?: AuctionHistoryQuality
  initialUpgrade?: AuctionHistoryUpgrade
}

type AuctionDealToastsState = {
  toasts: AuctionDealToast[]
  push: (toast: AuctionDealToast) => void
  dismiss: (id: string) => void
  clear: () => void
}

export const useAuctionDealToastsStore = create<AuctionDealToastsState>((set) => ({
  toasts: [],
  push: (toast) => set((s) => ({ toasts: [...s.toasts, toast] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}))
