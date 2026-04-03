export function getQualityGlowColor(qualityColor?: string): string {
  switch (qualityColor) {
    case 'RANK_NEWBIE':
      return '#3fbf4f'
    case 'RANK_STALKER':
      return '#3b82f6'
    case 'RANK_VETERAN':
      return '#ec4899'
    case 'RANK_MASTER':
      return '#ef4444'
    case 'DEFAULT':
    case 'RANK_LOCKPICK':
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
