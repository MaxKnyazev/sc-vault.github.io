import { useEffect } from 'react'
import {
  fetchAuctionItemActiveLots,
  fetchTrackedAuctionItems,
  type AuctionActiveLot,
  type AuctionHistoryUpgrade,
  type TrackedItemSubscription,
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
import { useAuctionTrackedSubscriptionsStore } from '../../shared/store/auctionTrackedSubscriptionsStore'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { isArtifactDataPath, isModuleCoreItem } from '../../shared/lib/itemKinds'

const ACTIVE_LOTS_POLL_MS = 60_000

function subscriptionEdgeKey(sub: TrackedItemSubscription): string {
  return `s|${sub.itemId}|${sub.kind}|${sub.quality}|${sub.upgradeMin}|${sub.upgradeMax}`
}

function toastInitialUpgrade(sub: TrackedItemSubscription): AuctionHistoryUpgrade {
  if (sub.kind === 'core') return 'all'
  if (sub.upgradeMin === sub.upgradeMax && sub.upgradeMin >= 1 && sub.upgradeMin <= 15) {
    return sub.upgradeMin as AuctionHistoryUpgrade
  }
  return 'all'
}

function filterLotsForSubscription(lots: AuctionActiveLot[], sub: TrackedItemSubscription): AuctionActiveLot[] {
  return lots.filter((lot) => {
    if (sub.quality !== 'all' && lot.quality !== sub.quality) return false
    if (sub.kind === 'core') return true
    return lot.upgrade >= sub.upgradeMin && lot.upgrade <= sub.upgradeMax
  })
}

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
        ids = await fetchTrackedAuctionItems('mine')
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
      const subscriptions = useAuctionTrackedSubscriptionsStore.getState().subscriptions
      const prevEdge = readQualifyingEdgeSnapshot()
      const nextEdge: Record<string, boolean> = {}
      const hideout = useHideoutStore.getState()
      const newToasts: AuctionDealToast[] = []

      const mineSet = new Set(ids)

      for (const sub of subscriptions) {
        if (!mineSet.has(sub.itemId)) continue
        const item = hideout.itemsById[sub.itemId]
        const name = getItemName(item?.name?.lines) || sub.itemId
        const isArtifact = isArtifactDataPath(item?.data)
        const isCore = item ? isModuleCoreItem(item.data, name) : false
        const applies =
          (sub.kind === 'core' && isCore) || (sub.kind === 'artifact' && isArtifact)
        if (!applies) continue

        const lots = nextLots[sub.itemId] ?? []
        const filtered = filterLotsForSubscription(lots, sub)
        const minP = minActiveLotUnitPrice(filtered, nowMs)
        const threshold = parseDesiredBuyRub(sub.desiredBuyPrice)
        const qualifying = threshold !== null && minP !== null && minP <= threshold
        const edgeKey = subscriptionEdgeKey(sub)
        nextEdge[edgeKey] = qualifying

        if (qualifying && minP !== null && prevEdge[edgeKey] !== true) {
          const iconUrl = item ? buildItemIconUrl(item.icon, hideout.realm) : undefined
          const qLabel = sub.quality === 'all' ? 'Все редкости' : sub.quality
          const toastName =
            sub.kind === 'core'
              ? `${name} — ${qLabel}`
              : `${name} — ${qLabel} (+${sub.upgradeMin}..+${sub.upgradeMax})`
          newToasts.push({
            id: `${Date.now()}-${edgeKey}-${Math.random().toString(16).slice(2)}`,
            itemId: sub.itemId,
            name: toastName,
            minPrice: minP,
            iconUrl,
            initialQuality: sub.quality,
            initialUpgrade: toastInitialUpgrade(sub),
          })
        }
      }

      for (const itemId of ids) {
        const lots = nextLots[itemId] ?? []
        const item = hideout.itemsById[itemId]
        const name = getItemName(item?.name?.lines) || itemId
        const isArtifact = isArtifactDataPath(item?.data)
        const isCore = item ? isModuleCoreItem(item.data, name) : false

        const relevantSubs = subscriptions.filter(
          (s) =>
            s.itemId === itemId &&
            ((s.kind === 'core' && isCore) || (s.kind === 'artifact' && isArtifact)),
        )

        if ((isArtifact || isCore) && relevantSubs.length > 0) {
          continue
        }

        const threshold = parseDesiredBuyRub(desired[itemId])
        const minP = minActiveLotUnitPrice(lots, nowMs)
        const qualifying = threshold !== null && minP !== null && minP <= threshold
        const edgeKey = `i|${itemId}`
        nextEdge[edgeKey] = qualifying

        if (qualifying && minP !== null && prevEdge[edgeKey] !== true) {
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
