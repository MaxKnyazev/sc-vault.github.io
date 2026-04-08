import { writeFile } from 'node:fs/promises'

const RECIPES_URL =
  'https://raw.githubusercontent.com/EXBO-Studio/stalcraft-database/main/global/hideout_recipes.json'

async function main() {
  const response = await fetch(RECIPES_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch recipes: ${response.status}`)
  }
  const payload = await response.json()
  const recipes = Array.isArray(payload?.recipes) ? payload.recipes : []

  const ids = new Set()
  for (const recipe of recipes) {
    for (const entry of recipe?.result ?? []) {
      if (typeof entry?.item === 'string' && entry.item.trim() !== '') ids.add(entry.item.trim())
    }
    for (const entry of recipe?.ingredients ?? []) {
      if (typeof entry?.item === 'string' && entry.item.trim() !== '') ids.add(entry.item.trim())
    }
  }

  const sorted = [...ids].sort()
  await writeFile('backend-shared/cron/item_ids.txt', `${sorted.join('\n')}\n`, 'utf8')
  console.log(`Generated ${sorted.length} item ids in backend-shared/cron/item_ids.txt`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

