const INSUFFICIENT_PREFIX = 'Недостаточно данных'

export type RecipeCostLineDisplay = {
  preview: string
  /** Текст подсказки при наведении на «?»; null — иконка не показывается. */
  hint: string | null
  isInsufficient: boolean
}

/** Краткая подпись до первого « · » (цена ₽/шт и т.п.). */
export function costLinePreviewSegment(line: string): string {
  const sep = line.indexOf(' · ')
  return sep === -1 ? line : line.slice(0, sep)
}

export function parseRecipeCostLineDisplay(line: string): RecipeCostLineDisplay {
  const trimmed = line.trim()
  if (!trimmed.startsWith(INSUFFICIENT_PREFIX)) {
    const preview = costLinePreviewSegment(trimmed)
    return {
      preview,
      hint: preview !== trimmed ? trimmed : null,
      isInsufficient: false,
    }
  }

  const parenStart = trimmed.indexOf('(')
  if (parenStart !== -1 && trimmed.endsWith(')')) {
    const details = trimmed.slice(parenStart + 1, -1).trim()
    return {
      preview: INSUFFICIENT_PREFIX,
      hint: details || trimmed,
      isInsufficient: true,
    }
  }

  return {
    preview: INSUFFICIENT_PREFIX,
    hint: trimmed.length > INSUFFICIENT_PREFIX.length ? trimmed : 'Нет данных для расчёта себестоимости',
    isInsufficient: true,
  }
}
