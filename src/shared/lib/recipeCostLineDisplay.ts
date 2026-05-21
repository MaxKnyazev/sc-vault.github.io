const INSUFFICIENT_PREFIX = 'Недостаточно данных'

export type RecipeCostLineDisplay = {
  preview: string
  hint: string | null
  isInsufficient: boolean
}

type UnresolvedCostMeta = {
  cycleUnanchored?: boolean
  unstableCycle?: boolean
  missingEnergy?: boolean
  missingIngredientIds?: string[]
  noRecipes?: boolean
  noBuy?: boolean
}

/** Убирает повторы в списке причин («нет цены скупа» дважды, ингредиент в ед. и мн. числе). */
export function dedupeInsufficientDataHint(details: string): string {
  const parts = details
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const ingredientNames = new Set<string>()
  const result: string[] = []

  for (const part of parts) {
    const singleIng = /^нет цены ингредиента:\s*(.+)$/i.exec(part)
    const multiIng = /^нет цен ингредиентов:\s*(.+)$/i.exec(part)

    let line = part
    if (singleIng) {
      const name = singleIng[1].trim()
      if (ingredientNames.has(name)) continue
      ingredientNames.add(name)
      line = `нет цены ингредиента: ${name}`
    } else if (multiIng) {
      const names = multiIng[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const fresh = names.filter((n) => !ingredientNames.has(n))
      for (const n of names) ingredientNames.add(n)
      if (fresh.length === 0) continue
      line =
        fresh.length === 1
          ? `нет цены ингредиента: ${fresh[0]}`
          : `нет цен ингредиентов: ${fresh.join(', ')}`
    }

    if (seen.has(line)) continue
    seen.add(line)
    result.push(line)
  }

  return result.join('; ')
}

export function buildInsufficientCostMessage(
  missingReasons: string[],
  options: {
    hasBuyOrLeafPrice: boolean
    buyMissingLabel: string
    meta: UnresolvedCostMeta | null | undefined
    ingredientNamesById: (id: string) => string
  },
): string {
  const reasons: string[] = [...missingReasons]
  const add = (msg: string) => {
    if (!reasons.includes(msg)) reasons.push(msg)
  }

  if (!options.hasBuyOrLeafPrice) add(options.buyMissingLabel)

  const meta = options.meta
  if (meta?.cycleUnanchored) add('цикл без ценового якоря')
  if (meta?.unstableCycle) add('цикл не сошелся')
  if (meta?.missingEnergy) add('нет цены энергии')

  const metaIds = meta?.missingIngredientIds ?? []
  if (metaIds.length > 0) {
    const alreadyInLoop = new Set(
      missingReasons
        .map((r) => /^нет цены ингредиента:\s*(.+)$/i.exec(r)?.[1]?.trim())
        .filter((x): x is string => Boolean(x)),
    )
    const extra = metaIds
      .filter((id) => !alreadyInLoop.has(options.ingredientNamesById(id)))
      .map((id) => options.ingredientNamesById(id))
    if (extra.length > 0) {
      add(`нет цен ингредиентов: ${extra.join(', ')}`)
    }
  }

  if (meta?.noRecipes) add('нет крафтовых рецептов')
  if (meta?.noBuy && !reasons.some((r) => r.includes('скуп') || r.includes('аукцион'))) {
    add(options.buyMissingLabel)
  }

  if (reasons.length === 0) return 'Недостаточно данных для расчета себестоимости'
  return `Недостаточно данных (${dedupeInsufficientDataHint(reasons.join('; '))})`
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
      hint: details ? dedupeInsufficientDataHint(details) : trimmed,
      isInsufficient: true,
    }
  }

  return {
    preview: INSUFFICIENT_PREFIX,
    hint: trimmed.length > INSUFFICIENT_PREFIX.length ? trimmed : 'Нет данных для расчёта себестоимости',
    isInsufficient: true,
  }
}
