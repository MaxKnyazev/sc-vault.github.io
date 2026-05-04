const EDGE_KEY = 'sc-vault-auction-qualifying-edge-v1'

export function readQualifyingEdgeSnapshot(): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(EDGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, boolean>
  } catch {
    return {}
  }
}

export function writeQualifyingEdgeSnapshot(next: Record<string, boolean>): void {
  try {
    sessionStorage.setItem(EDGE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}
