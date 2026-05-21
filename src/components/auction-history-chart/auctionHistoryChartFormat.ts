import type { AuctionHistoryRange } from '../../shared/api/backendApi'

export function parseUtcDate(ts: string): Date | null {
  const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z'
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function applyTimezoneOffset(date: Date, timezoneOffsetHours: number): Date {
  return new Date(date.getTime() + timezoneOffsetHours * 60 * 60 * 1000)
}

export function formatHistoryAxisLabel(
  ts: string,
  range: AuctionHistoryRange,
  timezoneOffsetHours: number,
): string {
  const utcDate = parseUtcDate(ts)
  if (!utcDate) return ts
  const d = applyTimezoneOffset(utcDate, timezoneOffsetHours)
  if (range === '30m' || range === '1h' || range === '12h') {
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }
  if (range === '24h' || range === '7d') {
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    })
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' })
}

export function formatHistoryTooltipTime(ts: string, timezoneOffsetHours: number): string {
  const utcDate = parseUtcDate(ts)
  if (!utcDate) return ts
  const d = applyTimezoneOffset(utcDate, timezoneOffsetHours)
  return d.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
}
