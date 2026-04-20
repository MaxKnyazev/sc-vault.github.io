import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  fetchBackendUserBuyPrices,
  saveBackendUserBuyPrice,
  saveBackendUserDefaultBuyPrice,
  saveBackendUserEnergyBuyPrice,
} from '../api/backendApi'
import { getBackendApiBaseUrl, getBackendAuthToken } from '../config/backendApi'

type IngredientPricesState = {
  buyPricesByItemId: Record<string, string>
  defaultBuyPricesByItemId: Record<string, string>
  energyPrice: string
  setBuyPrice: (itemId: string, value: string) => void
  setDefaultBuyPrice: (itemId: string, value: string) => Promise<void>
  loadRemoteBuyPrices: () => Promise<void>
  setEnergyPrice: (value: string) => void
}

export const useIngredientPricesStore = create<IngredientPricesState>()(
  persist(
    (set, get) => ({
      buyPricesByItemId: {},
      defaultBuyPricesByItemId: {},
      energyPrice: '',
      setBuyPrice: (itemId, value) => {
        set((state) => ({
          buyPricesByItemId: {
            ...state.buyPricesByItemId,
            [itemId]: value,
          },
        }))
        if (getBackendApiBaseUrl()) {
          void saveBackendUserBuyPrice(itemId, value)
        }
      },
      setDefaultBuyPrice: async (itemId, value) => {
        if (!getBackendApiBaseUrl() || !getBackendAuthToken()) return
        await saveBackendUserDefaultBuyPrice(itemId, value)
        await get().loadRemoteBuyPrices()
      },
      loadRemoteBuyPrices: async () => {
        if (!getBackendApiBaseUrl()) return
        if (!getBackendAuthToken()) {
          set({ buyPricesByItemId: {}, defaultBuyPricesByItemId: {}, energyPrice: '' })
          return
        }
        const remote = await fetchBackendUserBuyPrices()
        set({
          buyPricesByItemId: remote.itemPrices,
          defaultBuyPricesByItemId: remote.defaultPrices,
          energyPrice: remote.energyBuyPrice,
        })
      },
      setEnergyPrice: (value) => {
        set({ energyPrice: value })
        if (getBackendApiBaseUrl() && getBackendAuthToken()) {
          void saveBackendUserEnergyBuyPrice(value)
        }
      },
    }),
    {
      name: 'sc-vault-ingredient-prices-v2',
      partialize: (state) => ({ energyPrice: state.energyPrice }),
    },
  ),
)
