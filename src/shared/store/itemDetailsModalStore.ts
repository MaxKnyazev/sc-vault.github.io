import { create } from 'zustand'

type ItemDetailsModalState = {
  opened: boolean
  itemId: string | null
  open: (itemId: string) => void
  close: () => void
}

export const useItemDetailsModalStore = create<ItemDetailsModalState>((set) => ({
  opened: false,
  itemId: null,
  open: (itemId) => set({ opened: true, itemId }),
  close: () => set({ opened: false }),
}))
