import fs from 'node:fs'

const base =
  'https://raw.githubusercontent.com/EXBO-Studio/stalcraft-database/main/global'

function esc(s) {
  return String(s).replace(/"/g, '\\"').replace(/\r?\n/g, ' ')
}

function nid(prefix, id) {
  return prefix + id.replace(/[^a-zA-Z0-9_]/g, '_')
}

const [listing, hide] = await Promise.all([
  fetch(`${base}/listing.json`).then((r) => r.json()),
  fetch(`${base}/hideout_recipes.json`).then((r) => r.json()),
])

const idToName = new Map()
for (const it of listing) {
  const id = (it.data.split('/').pop() ?? '').replace('.json', '')
  idToName.set(id, it?.name?.lines?.ru ?? id)
}

const recipesByResult = new Map()
for (const r of hide.recipes) {
  for (const res of r.result) {
    if (!recipesByResult.has(res.item)) recipesByResult.set(res.item, [])
    recipesByResult.get(res.item).push(r)
  }
}

function nm(id) {
  return esc(idToName.get(id) ?? id)
}

function cat(r) {
  const c = r.category?.lines?.ru ?? 'Без категории'
  const s = r.subcategory?.lines?.ru ?? ''
  return esc(s ? `${c} / ${s}` : c)
}

const expanded = new Set()
const lines = []

lines.push('---')
lines.push('title: Дерево крафта Солянки (5l23g)')
lines.push('---')
lines.push('flowchart TD')
lines.push('  classDef item fill:#1e293b,stroke:#94a3b8,color:#e2e8f0;')
lines.push('  classDef recipe fill:#0f172a,stroke:#64748b,color:#94a3b8,stroke-dasharray:5 3;')

const emittedItem = new Set()
const emittedRecipe = new Set()

function ensureItemNode(itemId) {
  const node = nid('I_', itemId)
  if (!emittedItem.has(itemId)) {
    const itemLabel = `${nm(itemId)}\\n[${esc(itemId)}]`
    lines.push(`  ${node}["${itemLabel}"]:::item`)
    emittedItem.add(itemId)
  }
  return node
}

function ensureRecipeNode(itemId, ri, r, out) {
  const rid = nid('R_', `${itemId}_${ri}`)
  if (!emittedRecipe.has(rid)) {
    const rlabel = `Рецепт ${ri + 1}: ${cat(r)}\\nout x${out} | ${esc(r.bench)} | ${r.energy} en`
    lines.push(`  ${rid}["${rlabel}"]:::recipe`)
    emittedRecipe.add(rid)
  }
  return rid
}

function expand(itemId) {
  const recs = recipesByResult.get(itemId) ?? []
  if (recs.length === 0) {
    ensureItemNode(itemId)
    return
  }

  if (expanded.has(itemId)) return
  expanded.add(itemId)

  const itemNode = ensureItemNode(itemId)

  recs.forEach((r, ri) => {
    const res = r.result.find((x) => x.item === itemId)
    const out = res?.amount ?? '?'
    const rid = ensureRecipeNode(itemId, ri, r, out)
    lines.push(`  ${itemNode} --> ${rid}`)

    r.ingredients.forEach((ing) => {
      const childNode = ensureItemNode(ing.item)
      lines.push(`  ${rid} -->|"x${ing.amount}"| ${childNode}`)
      expand(ing.item)
    })
  })
}

const root = '5l23g'

lines.push('  START(["Солянка — корень"])')
ensureItemNode(root)
lines.push(`  START --> ${nid('I_', root)}`)

expand(root)

fs.writeFileSync('solyanka-craft-tree.mmd', lines.join('\n'), 'utf8')
console.log(`Wrote solyanka-craft-tree.mmd (${lines.length} lines)`)
