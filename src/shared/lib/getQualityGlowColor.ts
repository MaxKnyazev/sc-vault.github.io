export function getQualityGlowColor(qualityColor?: string): string {
  const normalized = (qualityColor ?? '').trim()
  if (normalized && /^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized
  }
  switch (normalized.toUpperCase()) {
    case 'NORMAL':
      return '#ffffff'
    case 'UNCOMMON':
      return '#22c55e'
    case 'SPECIAL':
      return '#3b82f6'
    case 'RARE':
      return '#a855f7'
    case 'EXCLUSIVE':
      return '#ec4899'
    case 'LEGENDARY':
      return '#f59e0b'
    case 'UNIQUE':
      return '#B57EDC'
    case 'RANK_NEWBIE':
      return '#3fbf4f'
    case 'RANK_STALKER':
      return '#3b82f6'
    case 'RANK_VETERAN':
      return '#ec4899'
    case 'RANK_MASTER':
      return '#ef4444'
    case 'RANK_LEGENDARY':
      return '#f59e0b'
    case 'RANK_LOCKPICK':
      return '#f59e0b'
    case 'DEFAULT':
    default:
      return '#ffffff'
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function getQualityModalGlowBoxShadow(qualityColor?: string): string {
  const glow = getQualityGlowColor(qualityColor)
  return [
    `0 0 0 1px ${hexToRgba(glow, 0.45)}`,
    `0 0 28px ${hexToRgba(glow, 0.55)}`,
    `0 0 56px ${hexToRgba(glow, 0.28)}`,
  ].join(', ')
}
