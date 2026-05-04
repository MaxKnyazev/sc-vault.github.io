import { useEffect } from 'react'
import {
  fetchAuctionItemActiveLots,
  fetchTrackedAuctionItems,
  type AuctionActiveLot,
} from '../../shared/api/backendApi'
import { getBackendApiBaseUrl } from '../../shared/config/backendApi'
import { minActiveLotUnitPrice } from '../../shared/lib/auctionActiveLotsUtils'
import { parseDesiredBuyRub } from '../../shared/lib/parseDesiredBuyRub'
import {
  readQualifyingEdgeSnapshot,
  writeQualifyingEdgeSnapshot,
} from '../../shared/lib/auctionQualifyingEdgeStorage'
import { playAuctionDealSound } from '../../shared/lib/playAuctionDealSound'
import { useAuthStore } from '../../shared/store/authStore'
import { useAuctionDesiredBuyPricesStore } from '../../shared/store/auctionDesiredBuyPricesStore'
import { useAuctionDealToastsStore, type AuctionDealToast } from '../../shared/store/auctionDealToastsStore'
import { useAuctionTrackedLotsStore } from '../../shared/store/auctionTrackedLotsStore'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'

const ACTIVE_LOTS_POLL_MS = 60_000

/** Сбрасываем снимок грани при новой сессии (логин / перезагрузка), чтобы на первом опросе сработали уведомления по текущим лотам. */
export function TrackedAuctionDealMonitor() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const pollTick = useAuctionTrackedLotsStore((s) => s.pollTick)
  const canPoll = user?.role === 'user' || user?.role === 'admin'

  useEffect(() => {
    if (!token) {
      writeQualifyingEdgeSnapshot({})
      return
    }
    if (!canPoll) return
    writeQualifyingEdgeSnapshot({})
  }, [token, canPoll])

  useEffect(() => {
    if (!token || !canPoll || !getBackendApiBaseUrl()) {
      useAuctionTrackedLotsStore.getState().clearLots()
      return
    }

    let cancelled = false

    const runPoll = async () => {
      let ids: string[] = []
      try {
        ids = await fetchTrackedAuctionItems()
      } catch {
        if (!cancelled) useAuctionTrackedLotsStore.getState().replaceLotsForTracked({})
        return
      }
      if (cancelled) return

      if (ids.length === 0) {
        useAuctionTrackedLotsStore.getState().replaceLotsForTracked({})
        writeQualifyingEdgeSnapshot({})
        return
      }

      const entries = await Promise.all(
        ids.map(async (itemId) => {
          try {
            const lots = await fetchAuctionItemActiveLots(itemId, 150)
            return [itemId, lots] as const
          } catch {
            return [itemId, [] as AuctionActiveLot[]] as const
          }
        }),
      )
      if (cancelled) return

      const nextLots: Record<string, AuctionActiveLot[]> = {}
      for (const [itemId, lots] of entries) {
        nextLots[itemId] = lots
      }
      useAuctionTrackedLotsStore.getState().replaceLotsForTracked(nextLots)

      const nowMs = Date.now()
      const desired = useAuctionDesiredBuyPricesStore.getState().desiredBuyByItemId
      const prevEdge = readQualifyingEdgeSnapshot()
      const nextEdge: Record<string, boolean> = {}
      const hideout = useHideoutStore.getState()
      const newToasts: AuctionDealToast[] = []

      for (const itemId of ids) {
        const lots = nextLots[itemId] ?? []
        const threshold = parseDesiredBuyRub(desired[itemId])
        const minP = minActiveLotUnitPrice(lots, nowMs)
        const qualifying = threshold !== null && minP !== null && minP <= threshold
        nextEdge[itemId] = qualifying

        if (qualifying && minP !== null && prevEdge[itemId] !== true) {
          const item = hideout.itemsById[itemId]
          const name = getItemName(item?.name?.lines) || itemId
          const iconUrl = item ? buildItemIconUrl(item.icon, hideout.realm) : undefined
          newToasts.push({
            id: `${Date.now()}-${itemId}-${Math.random().toString(16).slice(2)}`,
            itemId,
            name,
            minPrice: minP,
            iconUrl,
          })
        }
      }

      writeQualifyingEdgeSnapshot(nextEdge)

      if (newToasts.length > 0) {
        const push = useAuctionDealToastsStore.getState().push
        for (const t of newToasts) push(t)
        playAuctionDealSound()
      }
    }

    void runPoll()
    const intervalId = window.setInterval(() => void runPoll(), ACTIVE_LOTS_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [token, canPoll, pollTick])

  return null
}
