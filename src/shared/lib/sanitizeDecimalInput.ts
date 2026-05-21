/** Цифры и один десятичный разделитель (точка). Запятая приводится к точке. */
export function sanitizeDecimalInput(raw: string): string {
  const s = raw.replace(',', '.').replace(/[^\d.]/g, '')
  const i = s.indexOf('.')
  if (i === -1) return s
  return s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '')
}

/** Значение для отправки на сервер: пусто, одна точка или только точка в конце — как пустая строка. */
export function normalizeDecimalPriceForSubmit(raw: string): string {
  let s = sanitizeDecimalInput(raw).trim()
  if (s === '' || s === '.') return ''
  while (s.endsWith('.')) s = s.slice(0, -1)
  return s
}
