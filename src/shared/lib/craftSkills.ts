import type { HideoutRecipe } from '../../entities/hideout/types'
import type { CraftBranchLevels } from '../api/backendApi'

type RecipePerkId =
  | 'ammunition'
  | 'pyrotechnics'
  | 'armorer'
  | 'engineering'
  | 'cooking'
  | 'brewing'
  | 'medicine'
  | 'materials'

const PROFILE_TO_PERK: Record<keyof CraftBranchLevels, RecipePerkId> = {
  ammo: 'ammunition',
  pyrotechnics: 'pyrotechnics',
  protectiveGear: 'armorer',
  engineering: 'engineering',
  cooking: 'cooking',
  moonshining: 'brewing',
  medicine: 'medicine',
  rawMaterials: 'materials',
}

export function getRecipeRequiredSkill(recipe: HideoutRecipe): { perkId: RecipePerkId; level: number } | null {
  const perks = recipe.requirements?.perks
  if (!perks) return null
  let best: { perkId: RecipePerkId; level: number } | null = null
  for (const [rawPerkId, rawLevel] of Object.entries(perks)) {
    const perkId = rawPerkId as RecipePerkId
    const level = Number(rawLevel)
    if (!Number.isFinite(level) || level <= 0) continue
    if (!best || level > best.level) {
      best = { perkId, level }
    }
  }
  return best
}

export function getUserSkillLevel(levels: CraftBranchLevels | null | undefined, perkId: RecipePerkId): number {
  if (!levels) return 0
  for (const [profileKey, mappedPerkId] of Object.entries(PROFILE_TO_PERK) as Array<
    [keyof CraftBranchLevels, RecipePerkId]
  >) {
    if (mappedPerkId === perkId) {
      const raw = Number(levels[profileKey] ?? 0)
      return Number.isFinite(raw) ? raw : 0
    }
  }
  return 0
}

