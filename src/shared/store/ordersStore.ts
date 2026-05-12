import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  /** Монотонный номер для дефолтного названия, с 1 для пользователя */
  displayNumber: number
  title: string
  createdAt: number
  /** Срок в часах (опционально); deadlineAt = createdAt + hours*3600000 при установке */
  deadlineHours: number | null
  deadlineSetAt: number | null
  lines: OrderLine[]
}

type PerUserBucket = {
  orders: CraftOrder[]
  nextDisplayNumber: number
}

type OrdersState = {
  byUserId: Record<number, PerUserBucket>
  createOrder: (userId: number) => string
  updateTitle: (userId: number, orderId: string, title: string) => void
  removeOrder: (userId: number, orderId: string) => void
  setDeadlineHours: (userId: number, orderId: string, hours: number | null) => void
  addLine: (userId: number, orderId: string, recipeFavoriteId: string, quantity: number) => void
  updateLineQuantity: (userId: number, orderId: string, lineId: string, quantity: number) => void
  removeLine: (userId: number, orderId: string, lineId: string) => void
  toggleLineDone: (userId: number, orderId: string, lineId: string) => void
  resetUser: (userId: number) => void
  resetAll: () => void
}

function newLineId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function newOrderId(): string {
  return `ord-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function bucket(state: OrdersState, userId: number): PerUserBucket {
  return state.byUserId[userId] ?? { orders: [], nextDisplayNumber: 1 }
}

export const useOrdersStore = create<OrdersState>()(
    persist(
    (set) => ({
      byUserId: {},
      createOrder: (userId) => {
        const id = newOrderId()
        set((s) => {
          const b = bucket(s, userId)
          const displayNumber = b.nextDisplayNumber
          const order: CraftOrder = {
            id,
            displayNumber,
            title: `Заказ №${displayNumber}`,
            createdAt: Date.now(),
            deadlineHours: null,
            deadlineSetAt: null,
            lines: [],
          }
          return {
            byUserId: {
              ...s.byUserId,
              [userId]: {
                orders: [order, ...b.orders],
                nextDisplayNumber: displayNumber + 1,
              },
            },
          }
        })
        return id
      },
      updateTitle: (userId, orderId, title) => {
        set((s) => {
          const b = bucket(s, userId)
          return {
            byUserId: {
              ...s.byUserId,
              [userId]: {
                ...b,
                orders: b.orders.map((o) => (o.id === orderId ? { ...o, title: title.trim() || o.title } : o)),
              },
            },
          }
        })
      },
      removeOrder: (userId, orderId) => {
        set((s) => {
          const b = bucket(s, userId)
          return {
            byUserId: {
              ...s.byUserId,
              [userId]: { ...b, orders: b.orders.filter((o) => o.id !== orderId) },
            },
          }
        })
      },
      setDeadlineHours: (userId, orderId, hours) => {
        set((s) => {
          const b = bucket(s, userId)
          return {
            byUserId: {
              ...s.byUserId,
              [userId]: {
                ...b,
                orders: b.orders.map((o) =>
                  o.id === orderId
                    ? {
                        ...o,
                        deadlineHours: hours,
                        deadlineSetAt: hours !== null && hours > 0 ? Date.now() : null,
                      }
                    : o,
                ),
              },
            },
          }
        })
      },
      addLine: (userId, orderId, recipeFavoriteId, quantity) => {
        const q = Math.max(1, Math.floor(quantity))
        set((s) => {
          const b = bucket(s, userId)
          return {
            byUserId: {
              ...s.byUserId,
              [userId]: {
                ...b,
                orders: b.orders.map((o) => {
                  if (o.id !== orderId) return o
                  return {
                    ...o,
                    lines: [
                      ...o.lines,
                      {
                        id: newLineId(),
                        recipeFavoriteId,
                        quantity: q,
                        done: false,
                        doneAt: null,
                        createdOrder: o.lines.length,
                      },
                    ],
                  }
                }),
              },
            },
          }
        })
      },
      updateLineQuantity: (userId, orderId, lineId, quantity) => {
        const q = Math.max(1, Math.floor(quantity))
        set((s) => {
          const b = bucket(s, userId)
          return {
            byUserId: {
              ...s.byUserId,
              [userId]: {
                ...b,
                orders: b.orders.map((o) =>
                  o.id === orderId
                    ? {
                        ...o,
                        lines: o.lines.map((l) => (l.id === lineId ? { ...l, quantity: q } : l)),
                      }
                    : o,
                ),
              },
            },
          }
        })
      },
      removeLine: (userId, orderId, lineId) => {
        set((s) => {
          const b = bucket(s, userId)
          return {
            byUserId: {
              ...s.byUserId,
              [userId]: {
                ...b,
                orders: b.orders.map((o) =>
                  o.id === orderId ? { ...o, lines: o.lines.filter((l) => l.id !== lineId) } : o,
                ),
              },
            },
          }
        })
      },
      toggleLineDone: (userId, orderId, lineId) => {
        set((s) => {
          const b = bucket(s, userId)
          return {
            byUserId: {
              ...s.byUserId,
              [userId]: {
                ...b,
                orders: b.orders.map((o) => {
                  if (o.id !== orderId) return o
                  return {
                    ...o,
                    lines: o.lines.map((l) =>
                      l.id === lineId
                        ? {
                            ...l,
                            done: !l.done,
                            doneAt: !l.done ? Date.now() : null,
                          }
                        : l,
                    ),
                  }
                }),
              },
            },
          }
        })
      },
      resetUser: (userId) => {
        set((s) => {
          const next = { ...s.byUserId }
          delete next[userId]
          return { byUserId: next }
        })
      },
      resetAll: () => set({ byUserId: {} }),
    }),
    {
      name: 'sc-vault-craft-orders-v1',
      partialize: (s) => ({ byUserId: s.byUserId }),
    },
  ),
)
