import { ActionIcon, Box, Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { AuctionPrice24hLine } from '../auction-price-24h/AuctionPrice24hLine'
import { ItemBadge } from '../item-badge/ItemBadge'
import type { HideoutRecipe } from '../../entities/hideout/types'
import type { ListingItemWithId } from '../../entities/item/types'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import type { Realm } from '../../shared/config/app'
import { getLocalizedLine } from '../../shared/lib/getLocalizedLine'
import { useFavoritesStore } from '../../shared/store/favoritesStore'
import { useAuthStore } from '../../shared/store/authStore'
import { useRecipeOverridesStore } from '../../shared/store/recipeOverridesStore'
import { getRecipeFavoriteId } from '../../shared/lib/getRecipeFavoriteId'
import { AdminAuctionTrackingButton } from '../admin-auction-ignore/AdminAuctionTrackingButton'
import { getRecipeRequiredSkill, getUserSkillLevel } from '../../shared/lib/craftSkills'
import { getDuplicateCraftDisplayLabel } from '../../shared/lib/craftDuplicateRecipeLabels'
import { RecipeCostSummary } from './RecipeCostSummary'

function createEnergyIconSvg(fillColor: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54" fill="none">
      <path d="M30 8L16 30h10l-2 16 14-22H28l2-16z" fill="${fillColor}"/>
    </svg>`,
  )}`
}

type RecipeCardProps = {
  recipe: HideoutRecipe
  itemsById: Record<string, ListingItemWithId>
  realm: Realm
  recipeFavoriteId?: string
  hideRecipeTitle?: boolean
  hideResultSection?: boolean
  showResultTextOnly?: boolean
  showCraftToggle?: boolean
  defaultCraftOpen?: boolean
  showAdminOverrideControls?: boolean
  costBuyCraft?: string
  costHybrid?: string
  usedInRecipes?: HideoutRecipe[]
  onOpenCostTree?: (itemId: string) => void
}

function getItemPresentation(
  itemId: string,
  itemsById: Record<string, ListingItemWithId>,
  realm: Realm,
) {
  const item = itemsById[itemId]
  return {
    itemId,
    name: getItemName(item?.name?.lines) || itemId,
    iconUrl: item ? buildItemIconUrl(item.icon, realm) : undefined,
    qualityColor: item?.color,
  }
}

export function RecipeCard({
  recipe,
  itemsById,
  realm,
  recipeFavoriteId,
  hideRecipeTitle = false,
  hideResultSection = false,
  showResultTextOnly = false,
  showCraftToggle = true,
  defaultCraftOpen = false,
  showAdminOverrideControls = false,
  costBuyCraft,
  costHybrid,
  usedInRecipes = [],
  onOpenCostTree,
}: RecipeCardProps) {
  const { isFavoriteCraft, toggleFavoriteCraft } = useFavoritesStore()
  const user = useAuthStore((s) => s.user)
  const saveOneOverride = useRecipeOverridesStore((s) => s.saveOne)
  const overridesByRecipeId = useRecipeOverridesStore((s) => s.byRecipeId)
  const primaryResultItemId = recipe.result[0]?.item
  const recipeId = recipeFavoriteId || getRecipeFavoriteId(recipe)
  const duplicateCraftTitle = getDuplicateCraftDisplayLabel(recipe)
  const [isCraftOpen, setIsCraftOpen] = useState(defaultCraftOpen)
  const [showUsedIn, setShowUsedIn] = useState(false)
  const [isEditingBonus, setIsEditingBonus] = useState(false)
  const [draftBonus, setDraftBonus] = useState('0')
  const [isSavingLocal, setIsSavingLocal] = useState(false)
  const energyIconSvg = createEnergyIconSvg('#ffffff')
  const canEditOverride =
    showAdminOverrideControls &&
    user?.role === 'admin' &&
    !hideResultSection &&
    !showResultTextOnly &&
    Boolean(primaryResultItemId)
  const requiredSkill = getRecipeRequiredSkill(recipe)
  const userSkillLevel = requiredSkill ? getUserSkillLevel(user?.craftBranchLevels, requiredSkill.perkId) : 0
  const isSkillInsufficient = requiredSkill ? userSkillLevel < requiredSkill.level : false
  const activeOverride = overridesByRecipeId[recipeId]
  const currentBonus = activeOverride?.bonusAmount ?? 0
  const craftPartsCount = recipe.ingredients.length + (recipe.energy > 0 ? 1 : 0)
  const showCostSummary = Boolean(costBuyCraft && costHybrid && primaryResultItemId && !hideResultSection)
  const usedInCount = usedInRecipes.length

  useEffect(() => {
    setDraftBonus(String(currentBonus))
    setIsEditingBonus(false)
    setIsSavingLocal(false)
  }, [currentBonus, recipeId])

  const resultItems = useMemo(
    () =>
      recipe.result.map((entry) => {
        const view = getItemPresentation(entry.item, itemsById, realm)
        return { ...entry, ...view }
      }),
    [recipe.result, itemsById, realm],
  )

  const ingredientItems = useMemo(
    () =>
      recipe.ingredients.map((entry) => {
        const view = getItemPresentation(entry.item, itemsById, realm)
        return { ...entry, ...view }
      }),
    [recipe.ingredients, itemsById, realm],
  )

  const ingredientsBlock = (
    <Stack gap="xs" className="recipe-card__ingredients">
      {ingredientItems.map((item) => (
        <Stack key={`ingredient-${item.item}`} gap={4}>
          <ItemBadge
            itemId={item.itemId}
            showFavoriteButton={false}
            name={item.name}
            iconUrl={item.iconUrl}
            amount={item.amount}
            qualityColor={item.qualityColor}
            size="ingredient"
          />
          <AuctionPrice24hLine itemId={item.itemId} layout="stacked" />
        </Stack>
      ))}
      {recipe.energy > 0 ? (
        <ItemBadge
          name="Энергия"
          amount={recipe.energy}
          iconUrl={energyIconSvg}
          qualityColor="DEFAULT"
          size="ingredient"
          disableGlow
        />
      ) : null}
    </Stack>
  )

  return (
    <Stack
      gap="sm"
      p="md"
      className={`surface-card recipe-card${isSkillInsufficient ? ' recipe-card--warning' : ''}`}
    >
      <Box className="recipe-card__main">
        {isSkillInsufficient ? (
          <Text size="xs" fw={700} className="recipe-card__skill-warn">
            Недостаточный уровень навыка
          </Text>
        ) : null}
        {recipeFavoriteId && primaryResultItemId ? (
          <ActionIcon
            size={36}
            variant="subtle"
            color={isFavoriteCraft(recipeFavoriteId) ? 'yellow' : 'gray'}
            onClick={(event) => {
              event.stopPropagation()
              toggleFavoriteCraft(recipeFavoriteId)
            }}
            className="recipe-card__favorite"
            aria-label="Добавить крафт в избранное"
          >
            {isFavoriteCraft(recipeFavoriteId) ? '★' : '☆'}
          </ActionIcon>
        ) : null}

        {!hideRecipeTitle ? (
          <Stack gap={4} pr={recipeFavoriteId ? 36 : 0} style={{ minWidth: 0 }}>
            {duplicateCraftTitle ? (
              <Text size="md" fw={700} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                {duplicateCraftTitle}
              </Text>
            ) : null}
            <Text
              size="sm"
              fw={600}
              c={duplicateCraftTitle ? 'dimmed' : undefined}
              style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
            >
              {getLocalizedLine(recipe.category.lines)}
              {recipe.subcategory?.lines ? ` / ${getLocalizedLine(recipe.subcategory.lines)}` : ''}
            </Text>
          </Stack>
        ) : null}

        {!hideResultSection ? (
          <Stack gap="sm" className="recipe-card__result-block" mt={hideRecipeTitle ? 0 : 'xs'}>
            {resultItems.map((item) => (
              <Stack key={`result-${item.item}`} gap={6}>
                <ItemBadge
                  itemId={item.itemId}
                  showFavoriteButton={false}
                  name={item.name}
                  iconUrl={item.iconUrl}
                  amount={item.amount}
                  qualityColor={item.qualityColor}
                  size="result"
                />
                <AuctionPrice24hLine itemId={item.itemId} />
                <Box className="recipe-card__admin-track">
                  <AdminAuctionTrackingButton itemId={item.itemId} itemName={item.name} />
                </Box>
              </Stack>
            ))}

            {showCostSummary ? (
              <RecipeCostSummary
                buyCraftLine={costBuyCraft!}
                hybridLine={costHybrid!}
                onOpenCostTree={
                  onOpenCostTree && primaryResultItemId
                    ? () => onOpenCostTree(primaryResultItemId)
                    : undefined
                }
              />
            ) : null}
          </Stack>
        ) : showResultTextOnly ? (
          <Stack gap={4}>
            {resultItems.map((item) => (
              <Text key={`result-text-${item.item}`} size="sm" fw={600}>
                {item.name} x{item.amount}
              </Text>
            ))}
          </Stack>
        ) : null}
      </Box>

      <Box className="recipe-card__footer">
        {showCraftToggle ? (
          <Stack gap={6}>
            <Button
              variant="default"
              color="gray"
              size="xs"
              fullWidth
              onClick={() => setIsCraftOpen((prev) => !prev)}
              aria-expanded={isCraftOpen}
            >
              {isCraftOpen ? `Скрыть состав крафта (${craftPartsCount})` : `Состав крафта (${craftPartsCount})`}
            </Button>
            {isCraftOpen ? ingredientsBlock : null}
            {usedInCount > 0 ? (
              <Button
                variant="default"
                color="gray"
                size="xs"
                fullWidth
                onClick={() => setShowUsedIn((prev) => !prev)}
                aria-expanded={showUsedIn}
              >
                {showUsedIn
                  ? `Скрыть «Для чего используется» (${usedInCount})`
                  : `Для чего используется (${usedInCount})`}
              </Button>
            ) : null}
            {showUsedIn && usedInCount > 0 ? (
              <Stack gap="xs" className="recipe-card__used-in-list">
                {usedInRecipes.map((parentRecipe, index) => {
                  const parentTitle = getDuplicateCraftDisplayLabel(parentRecipe)
                  const categoryLine = getLocalizedLine(parentRecipe.category.lines)
                  return (
                    <Stack
                      key={`used-in-${parentRecipe.bench}-${index}`}
                      gap={6}
                      p="sm"
                      className="recipe-card__used-in-item"
                    >
                      <Text size="xs" fw={600} lh={1.35}>
                        {parentTitle || categoryLine}
                      </Text>
                      {parentTitle ? (
                        <Text size="xs" c="dimmed" lh={1.3}>
                          {categoryLine}
                        </Text>
                      ) : null}
                      {parentRecipe.result.map((entry) => {
                        const view = getItemPresentation(entry.item, itemsById, realm)
                        return (
                          <ItemBadge
                            key={`used-in-result-${entry.item}-${entry.amount}`}
                            itemId={view.itemId}
                            name={view.name}
                            iconUrl={view.iconUrl}
                            amount={entry.amount}
                            qualityColor={view.qualityColor}
                            size="ingredient"
                            showFavoriteButton={false}
                          />
                        )
                      })}
                    </Stack>
                  )
                })}
              </Stack>
            ) : null}
          </Stack>
        ) : (
          ingredientsBlock
        )}

        {canEditOverride ? (
          <Stack gap={6} className="recipe-card__admin-bonus" mt="sm">
            <Text size="sm" fw={600}>
              Бонусный крафт
            </Text>
            <Group wrap="nowrap" align="flex-end">
              <TextInput
                value={draftBonus}
                onChange={(event) => {
                  const raw = event.currentTarget.value.replace(',', '.')
                  const sanitized = raw
                    .replace(/[^\d.]/g, '')
                    .replace(/^(\d*\.\d*).*$/, '$1')
                  setDraftBonus(sanitized)
                }}
                disabled={!isEditingBonus || isSavingLocal}
                style={{ flex: 1 }}
              />
              <Button
                style={{ minWidth: 168, height: 36 }}
                variant="default"
                color="gray"
                loading={isSavingLocal}
                onClick={async () => {
                  if (!isEditingBonus) {
                    setIsEditingBonus(true)
                    return
                  }
                  if (!primaryResultItemId) return
                  const parsedBonus = Number.parseFloat(draftBonus.replace(',', '.'))
                  const safeBonus =
                    Number.isFinite(parsedBonus) && parsedBonus >= 0 ? Number(parsedBonus.toFixed(3)) : 0
                  setIsSavingLocal(true)
                  try {
                    await saveOneOverride({
                      recipeId,
                      resultItemId: primaryResultItemId,
                      baseAmount: null,
                      bonusAmount: safeBonus,
                    })
                    setIsEditingBonus(false)
                  } finally {
                    setIsSavingLocal(false)
                  }
                }}
              >
                {isEditingBonus ? 'Сохранить' : 'Изменить бонус'}
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Дефолтное значение: 0, текущий бонус: {currentBonus}
              {requiredSkill
                ? ` · Требуется: ${requiredSkill.level}, ваш уровень: ${userSkillLevel}`
                : ''}
            </Text>
          </Stack>
        ) : null}
      </Box>
    </Stack>
  )
}
