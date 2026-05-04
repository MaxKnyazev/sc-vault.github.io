import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type AuctionDesiredBuyPricesState = {
  desiredBuyByItemId: Record<string, string>
  setDesiredBuyPrice: (itemId: string, value: string) => void
}

export const useAuctionDesiredBuyPricesStore = create<AuctionDesiredBuyPricesState>()(
  persist(
    (set) => ({
      desiredBuyByItemId: {},
      setDesiredBuyPrice: (itemId, value) =>
        set((state) => ({
          desiredBuyByItemId: {
            ...state.desiredBuyByItemId,
            [itemId]: value,
          },
        })),
    }),
    { name: 'sc-vault-auction-desired-buy-v1' },
  ),
)
