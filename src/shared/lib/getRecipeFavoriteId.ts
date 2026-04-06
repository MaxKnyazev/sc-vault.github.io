import type { HideoutRecipe } from '../../entities/hideout/types'
import { getLocalizedLine } from './getLocalizedLine'

function encodeEntries(entries: HideoutRecipe['result']): string {
  return entries.map((entry) => `${entry.item}:${entry.amount}`).join('|')
}

export function getRecipeFavoriteId(recipe: HideoutRecipe): string {
  const category = getLocalizedLine(recipe.category.lines) || ''
  const subcategory = recipe.subcategory?.lines ? getLocalizedLine(recipe.subcategory.lines) : ''
  const result = encodeEntries(recipe.result)
  const ingredients = encodeEntries(recipe.ingredients)
  return [recipe.bench, category, subcategory, recipe.energy, result, ingredients].join('::')
}
