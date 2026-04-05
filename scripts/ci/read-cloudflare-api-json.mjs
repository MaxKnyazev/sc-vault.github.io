/**
 * fetch() к api.cloudflare.com иногда возвращает HTML (404/прокси/неверный account_id) — res.json() падает.
 */
export async function readCloudflareApiJson(res) {
  const text = await res.text()
  const t = text.trim()
  if (t.startsWith('<') || (t.length > 0 && !t.startsWith('{') && !t.startsWith('['))) {
    throw new Error(
      `Cloudflare API вернул не JSON (HTTP ${res.status}). Проверьте CLOUDFLARE_API_TOKEN и CLOUDFLARE_ACCOUNT_ID (32 hex-символа, без пробелов). Фрагмент ответа: ${t.slice(0, 280)}`,
    )
  }
  try {
    return JSON.parse(t)
  } catch {
    throw new Error(
      `Cloudflare API: невалидный JSON (HTTP ${res.status}): ${t.slice(0, 280)}`,
    )
  }
}

/** Убирает пробелы/переносы из секрета GitHub */
export function normalizeAccountId(id) {
  if (id == null || id === '') return id
  return String(id).trim().replace(/\s+/g, '')
}
