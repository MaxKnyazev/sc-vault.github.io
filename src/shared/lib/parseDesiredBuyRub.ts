export function parseDesiredBuyRub(raw: string | undefined): number | null {
  const digits = (raw ?? '').replace(/[^\d]/g, '')
  if (digits === '') return null
  const n = Number(digits)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}
