import type { OrderLine } from '../store/ordersStore'

/** Сортировка строк заказа: сначала не готовые, затем готовые (внизу). */
export function sortOrderLines(lines: OrderLine[]): OrderLine[] {
  return [...lines].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.done && b.done) return (a.doneAt ?? 0) - (b.doneAt ?? 0)
    return a.createdOrder - b.createdOrder
  })
}
