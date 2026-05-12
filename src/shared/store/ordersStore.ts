import { create } from 'zustand'
import {
  addCraftOrderLine,
  createCraftOrder,
  deleteCraftOrder,
  deleteCraftOrderLine,
  fetchCraftOrders,
  patchCraftOrder,
  patchCraftOrderLine,
  type CraftOrderDto,
} from '../api/backendApi'

export type OrderLine = {
  id: string
  recipeFavoriteId: string
  quantity: number
  done: boolean
  doneAt: number | null
  createdOrder: number
}

export type CraftOrder = {
  id: string
  displayNumber: number
  title: string
  createdAt: number
  deadlineHours: number | null
  deadlineSetAt: number | null
  lines: OrderLine[]
}

function mapDto(o: CraftOrderDto): CraftOrder {
  return {
    id: String(o.id),
    displayNumber: o.displayNumber,
    title: o.title,
    createdAt: o.createdAt,
    deadlineHours: o.deadlineHours,
    deadlineSetAt: o.deadlineSetAt,
    lines: (o.lines ?? []).map((l) => ({
      id: String(l.id),
      recipeFavoriteId: l.recipeFavoriteId,
      quantity: l.quantity,
      done: l.done,
      doneAt: l.doneAt,
      createdOrder: l.createdOrder,
    })),
  }
}

type OrdersState = {
  orders: CraftOrder[]
  isLoading: boolean
  error: string | null
  migrationsPending: boolean
  loadRemote: () => Promise<void>
  createOrder: () => Promise<void>
  updateTitle: (orderId: string, title: string) => Promise<void>
  removeOrder: (orderId: string) => Promise<void>
  setDeadlineHours: (orderId: string, hours: number | null) => Promise<void>
  addLine: (orderId: string, recipeFavoriteId: string, quantity: number) => Promise<void>
  updateLineQuantity: (orderId: string, lineId: string, quantity: number) => Promise<void>
  removeLine: (orderId: string, lineId: string) => Promise<void>
  toggleLineDone: (orderId: string, lineId: string, done: boolean) => Promise<void>
  reset: () => void
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: [],
  isLoading: false,
  error: null,
  migrationsPending: false,
  reset: () => set({ orders: [], isLoading: false, error: null, migrationsPending: false }),
  loadRemote: async () => {
    set({ isLoading: true, error: null })
    try {
      const { orders, migrationsPending } = await fetchCraftOrders()
      set({
        orders: orders.map(mapDto),
        migrationsPending,
        isLoading: false,
      })
    } catch (e) {
      set({
        orders: [],
        isLoading: false,
        error: e instanceof Error ? e.message : 'Не удалось загрузить заказы',
      })
    }
  },
  createOrder: async () => {
    try {
      await createCraftOrder()
      await get().loadRemote()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Не удалось создать заказ' })
      throw e
    }
  },
  updateTitle: async (orderId, title) => {
    await patchCraftOrder({ orderId, title })
    await get().loadRemote()
  },
  removeOrder: async (orderId) => {
    await deleteCraftOrder(orderId)
    await get().loadRemote()
  },
  setDeadlineHours: async (orderId, hours) => {
    await patchCraftOrder({ orderId, deadlineHours: hours })
    await get().loadRemote()
  },
  addLine: async (orderId, recipeFavoriteId, quantity) => {
    await addCraftOrderLine(orderId, recipeFavoriteId, quantity)
    await get().loadRemote()
  },
  updateLineQuantity: async (_orderId, lineId, quantity) => {
    await patchCraftOrderLine({ lineId, quantity })
    await get().loadRemote()
  },
  removeLine: async (_orderId, lineId) => {
    await deleteCraftOrderLine(lineId)
    await get().loadRemote()
  },
  toggleLineDone: async (_orderId, lineId, done) => {
    await patchCraftOrderLine({ lineId, done })
    await get().loadRemote()
  },
}))
