import type { HideoutRecipe } from '../../entities/hideout/types'
import type { ListingItemWithId } from '../../entities/item/types'

type ManualRecipeDef = {
  resultNameRu: string
  resultAmount: number
  ingredientNameRu: string
  ingredientAmount: number
  perkId: 'pyrotechnics' | 'medicine'
}

const MANUAL_RECIPES: ManualRecipeDef[] = [
  {
    resultNameRu: 'Самодельный светошум',
    resultAmount: 10,
    ingredientNameRu: 'Ящик самодельных светошумов',
    ingredientAmount: 1,
    perkId: 'pyrotechnics',
  },
  {
    resultNameRu: 'Граната «Кустарник-1»',
    resultAmount: 10,
    ingredientNameRu: 'Ящик гранат «Кустарник-1»',
    ingredientAmount: 1,
    perkId: 'pyrotechnics',
  },
  {
    resultNameRu: 'Аптечка проводника',
    resultAmount: 10,
    ingredientNameRu: 'Подсумок с аптечками проводника',
    ingredientAmount: 1,
    perkId: 'medicine',
  },
]

function byRuName(itemsById: Record<string, ListingItemWithId>, nameRu: string): ListingItemWithId | null {
  for (const item of Object.values(itemsById)) {
    if ((item.name?.lines?.ru ?? '') === nameRu) return item
  }
  return null
}

function textLine(value: string) {
  return { type: 'text' as const, text: value, lines: { ru: value } }
}

export function buildCustomManualRecipes(itemsById: Record<string, ListingItemWithId>): HideoutRecipe[] {
  const out: HideoutRecipe[] = []
  for (const def of MANUAL_RECIPES) {
    const result = byRuName(itemsById, def.resultNameRu)
    const ingredient = byRuName(itemsById, def.ingredientNameRu)
    if (!result || !ingredient) continue
    out.push({
      bench: 'manual_unpack',
      category: textLine('Материалы'),
      subcategory: textLine('Распаковка'),
      result: [{ item: result.id, amount: def.resultAmount }],
      ingredients: [{ item: ingredient.id, amount: def.ingredientAmount }],
      energy: 0,
      requirements: {
        perks: {
          [def.perkId]: 1,
        },
        features: ['manual_unpack_no_energy', 'manual_unpack_no_bonus'],
      },
    })
  }
  return out
}
