/**
 * Находит предметы, для которых в hideout_recipes.json есть ≥2 разных рецепта
 * с этим предметом в result (разные пути получения одного и того же выхода).
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BASE = 'https://raw.githubusercontent.com/EXBO-Studio/stalcraft-database/main/global'

function getItemIdFromDataPath(dataPath) {
  const normalized = String(dataPath ?? '').replaceAll('\\', '/')
  const fileName = normalized.split('/').pop() ?? ''
  return fileName.replace('.json', '')
}

function getLocalizedLine(lines, preferredLanguage = 'ru') {
  if (!lines || typeof lines !== 'object') return ''
  return lines[preferredLanguage] ?? lines.en ?? Object.values(lines)[0] ?? ''
}

function encodeEntries(entries) {
  if (!Array.isArray(entries)) return ''
  return entries.map((e) => `${e.item}:${e.amount}`).join('|')
}

function recipeFavoriteId(recipe) {
  const category = getLocalizedLine(recipe.category?.lines) || ''
  const sub = recipe.subcategory?.lines ? getLocalizedLine(recipe.subcategory.lines) : ''
  const result = encodeEntries(recipe.result)
  const ingredients = encodeEntries(recipe.ingredients)
  return [recipe.bench, category, sub, recipe.energy, result, ingredients].join('::')
}

function itemNameRu(itemsById, itemId) {
  const it = itemsById[itemId]
  const ru = it?.name?.lines?.ru
  if (ru) return ru
  const en = it?.name?.lines?.en
  if (en) return en
  return itemId
}

function recipeSummary(recipe, itemsById) {
  const cat = getLocalizedLine(recipe.category?.lines) || '—'
  const sub = recipe.subcategory?.lines ? getLocalizedLine(recipe.subcategory.lines) : '—'
  const res = (recipe.result ?? [])
    .map((r) => `${itemNameRu(itemsById, r.item)} ×${r.amount}`)
    .join(', ')
  const ing = (recipe.ingredients ?? [])
    .map((i) => `${itemNameRu(itemsById, i.item)} ×${i.amount}`)
    .join(', ')
  return {
    line: `[${recipe.bench}] ${cat} / ${sub} | энергия ${recipe.energy ?? 0} | → ${res} | ингр: ${ing || '—'}`,
  }
}

async function main() {
  const [recipesRes, listingRes] = await Promise.all([
    fetch(`${BASE}/hideout_recipes.json`),
    fetch(`${BASE}/listing.json`),
  ])
  if (!recipesRes.ok) throw new Error(`recipes ${recipesRes.status}`)
  if (!listingRes.ok) throw new Error(`listing ${listingRes.status}`)
  const recipesPayload = await recipesRes.json()
  const listing = await listingRes.json()
  const recipes = Array.isArray(recipesPayload?.recipes) ? recipesPayload.recipes : []

  const itemsById = {}
  for (const entry of Array.isArray(listing) ? listing : []) {
    const id = getItemIdFromDataPath(entry?.data)
    if (id) itemsById[id] = entry
  }

  /** @type {Map<string, Map<string, object>>} */
  const byOutputItem = new Map()

  for (const recipe of recipes) {
    const fid = recipeFavoriteId(recipe)
    for (const r of recipe?.result ?? []) {
      if (typeof r?.item !== 'string' || !r.item.trim()) continue
      const itemId = r.item.trim()
      if (!byOutputItem.has(itemId)) byOutputItem.set(itemId, new Map())
      byOutputItem.get(itemId).set(fid, recipe)
    }
  }

  const duplicates = []
  for (const [itemId, recipeMap] of byOutputItem) {
    if (recipeMap.size < 2) continue
    duplicates.push({
      itemId,
      name: itemNameRu(itemsById, itemId),
      recipes: [...recipeMap.values()],
    })
  }

  duplicates.sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  const lines = []
  lines.push(`Предметов с ≥2 рецептами на один и тот же выход: ${duplicates.length}`)
  lines.push('')

  for (const { itemId, name, recipes: group } of duplicates) {
    lines.push(`## ${name}`)
    lines.push(`item id: \`${itemId}\` — рецептов: ${group.length}`)
    let i = 1
    for (const r of group) {
      const { line } = recipeSummary(r, itemsById)
      lines.push(`${i}. ${line}`)
      i++
    }
    lines.push('')
  }

  const text = lines.join('\n')
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'duplicate-output-recipes-report.txt')
  await writeFile(outPath, text, 'utf8')
  console.log(text)
  console.error(`\nSaved: ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
