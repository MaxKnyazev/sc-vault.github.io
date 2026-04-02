import type { LocalizedText } from '../../shared/types/common'

export type HideoutRecipeItemAmount = {
  item: string
  amount: number
}

export type HideoutRecipe = {
  bench: string
  category: LocalizedText
  subcategory: LocalizedText
  result: HideoutRecipeItemAmount[]
  ingredients: HideoutRecipeItemAmount[]
  energy: number
  requirements?: {
    perks?: Record<string, number>
    features?: string[]
  }
}

export type HideoutRecipesResponse = {
  perks: Array<{
    id: string
    name: LocalizedText
    desc: LocalizedText
  }>
  recipes: HideoutRecipe[]
}
