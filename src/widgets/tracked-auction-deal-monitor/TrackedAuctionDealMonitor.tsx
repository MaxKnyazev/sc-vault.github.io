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
import { useAuctionTrackedItemRulesStore } from '../../shared/store/auctionTrackedItemRulesStore'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { isArtifactDataPath, isModuleCoreItem } from '../../shared/lib/itemKinds'
import { fetchVirtualActiveLotMins } from '../../shared/api/backendApi'
import { useAuctionVirtualTrackingsStore } from '../../shared/store/auctionVirtualTrackingsStore'

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
      const rulesByItemId = useAuctionTrackedItemRulesStore.getState().rulesByItemId
      const prevEdge = readQualifyingEdgeSnapshot()
      const nextEdge: Record<string, boolean> = {}
      const hideout = useHideoutStore.getState()
      const newToasts: AuctionDealToast[] = []
      let virtualMins: Record<string, { minPrice: number; itemId: string; updatedAt: string }> = {}
      try {
        virtualMins = await fetchVirtualActiveLotMins()
      } catch {
        virtualMins = {}
      }

      const virtualTrackings = useAuctionVirtualTrackingsStore.getState().trackings
      for (const t of virtualTrackings) {
        // Cache table stores artifact mins per exact upgrade; for диапазона берём минимум по всем upgrade в диапазоне.
        let minRow: { minPrice: number; itemId: string } | null = null
        if (t.kind === 'core') {
          const r = virtualMins[`core|${t.quality}|-1`]
          if (r) minRow = { minPrice: r.minPrice, itemId: r.itemId }
        } else {
          for (let u = t.upgradeMin; u <= t.upgradeMax; u += 1) {
            const r = virtualMins[`artifact|${t.quality}|${u}`]
            if (!r) continue
            if (!minRow || r.minPrice < minRow.minPrice) minRow = { minPrice: r.minPrice, itemId: r.itemId }
          }
        }
        const threshold = parseDesiredBuyRub(t.desiredBuyPrice)
        const qualifying = threshold !== null && minRow !== null && minRow.minPrice <= threshold
        const edgeKey = `v|${t.kind}|${t.quality}|${t.upgradeMin}|${t.upgradeMax}`
        nextEdge[edgeKey] = qualifying
        if (qualifying && minRow && prevEdge[edgeKey] !== true) {
          const name =
            t.kind === 'core'
              ? `Ядро модуля — ${t.quality}`
              : `Артефакт — ${t.quality} (+${t.upgradeMin}..+${t.upgradeMax})`
          newToasts.push({
            id: `${Date.now()}-${edgeKey}-${Math.random().toString(16).slice(2)}`,
            itemId: minRow.itemId,
            name,
            minPrice: minRow.minPrice,
            initialQuality: t.quality,
          })
        }
      }

      for (const itemId of ids) {
        const lots = nextLots[itemId] ?? []
        const threshold = parseDesiredBuyRub(desired[itemId])
        const item = hideout.itemsById[itemId]
        const name = getItemName(item?.name?.lines) || itemId
        const isArtifact = isArtifactDataPath(item?.data)
        const isCore = item ? isModuleCoreItem(item.data, name) : false

        const rule = rulesByItemId[itemId]
        const filteredLots =
          rule && rule.qualities.length > 0 && (isArtifact || isCore)
            ? lots.filter((lot) => {
                if (!rule.qualities.includes(lot.quality)) return false
                if (isArtifact && rule.upgrades.length > 0) return rule.upgrades.includes(lot.upgrade)
                return true
              })
            : lots

        const minP = minActiveLotUnitPrice(filteredLots, nowMs)
        const qualifying = threshold !== null && minP !== null && minP <= threshold
        nextEdge[`i|${itemId}`] = qualifying

        if (qualifying && minP !== null && prevEdge[`i|${itemId}`] !== true) {
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
