import { RouterProvider } from 'react-router-dom'
import { useEffect } from 'react'
import { appRouter } from './app/router'
import { useAuthStore } from './shared/store/authStore'
import { useAuctionBlacklistStore } from './shared/store/auctionBlacklistStore'
import { useAuctionPricesStore } from './shared/store/auctionPricesStore'
import { useIngredientPricesStore } from './shared/store/ingredientPricesStore'
import { useAuctionDesiredBuyPricesStore } from './shared/store/auctionDesiredBuyPricesStore'
import { useAuctionTrackedLotsStore } from './shared/store/auctionTrackedLotsStore'
import { useAuctionDealToastsStore } from './shared/store/auctionDealToastsStore'
import { useAuctionTrackedSubscriptionsStore } from './shared/store/auctionTrackedSubscriptionsStore'
import { useOrdersStore } from './shared/store/ordersStore'

function App() {
  const bootstrapAuth = useAuthStore((s) => s.bootstrapAuth)
  const token = useAuthStore((s) => s.token)
  const isAuthResolved = useAuthStore((s) => s.isAuthResolved)
  const loadRemoteBuyPrices = useIngredientPricesStore((s) => s.loadRemoteBuyPrices)
  const loadTrackedDesiredBuyPrices = useAuctionDesiredBuyPricesStore((s) => s.loadRemote)
  const loadTrackedSubscriptions = useAuctionTrackedSubscriptionsStore((s) => s.loadRemote)

  useEffect(() => {
    void bootstrapAuth()
  }, [bootstrapAuth])

  useEffect(() => {
    if (!isAuthResolved) return
    void loadRemoteBuyPrices()
  }, [isAuthResolved, token, loadRemoteBuyPrices])

  useEffect(() => {
    if (!isAuthResolved) return
    void loadTrackedDesiredBuyPrices()
  }, [isAuthResolved, token, loadTrackedDesiredBuyPrices])

  useEffect(() => {
    if (!isAuthResolved) return
    void loadTrackedSubscriptions()
  }, [isAuthResolved, token, loadTrackedSubscriptions])

  useEffect(() => {
    if (token) return
    useAuctionDesiredBuyPricesStore.getState().reset()
    useAuctionTrackedSubscriptionsStore.getState().reset()
    useAuctionTrackedLotsStore.getState().clearLots()
    useAuctionDealToastsStore.getState().clear()
    useOrdersStore.getState().reset()
  }, [token])

  useEffect(() => {
    void (async () => {
      await useAuctionBlacklistStore.getState().load()
      const bl = useAuctionBlacklistStore.getState().blacklist
      const remove = useAuctionPricesStore.getState().removeItemFromCache
      for (const id of bl) {
        remove(id)
      }
    })()
  }, [])

  return <RouterProvider router={appRouter} />
}

export default App
