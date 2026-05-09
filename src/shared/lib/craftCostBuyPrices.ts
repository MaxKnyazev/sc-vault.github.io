/**
 * Единая карта скупа для расчёта крафта: явная цена пользователя перекрывает дефолт админа;
 * пустая строка в пользовательских ценах не затирает дефолт (важно для согласованности с бэкендом).
 */
export function mergeUserAndDefaultBuyPrices(
  userByItemId: Record<string, string>,
  defaultByItemId: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...defaultByItemId }
  for (const [id, raw] of Object.entries(userByItemId)) {
    const v = (raw ?? '').trim()
    if (v !== '') out[id] = v
  }
  return out
}
