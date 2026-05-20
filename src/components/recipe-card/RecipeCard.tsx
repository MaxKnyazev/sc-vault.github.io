import { ActionIcon, Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
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
  costLine1?: string
  costLine2?: string
  costLine3?: string
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
  costLine1,
  costLine2,
  costLine3,
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
  const [isCostTreeHovered, setIsCostTreeHovered] = useState(false)
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

  useEffect(() => {
    setDraftBonus(String(currentBonus))
    setIsEditingBonus(false)
    setIsSavingLocal(false)
  }, [currentBonus, recipeId])

  const resultItems = recipe.result.map((entry) => {
    const view = getItemPresentation(entry.item, itemsById, realm)
    return { ...entry, ...view }
  })

  const ingredientItems = recipe.ingredients.map((entry) => {
    const view = getItemPresentation(entry.item, itemsById, realm)
    return { ...entry, ...view }
  })

  return (
    <Stack
      gap="sm"
      p="md"
      className={`surface-card recipe-card${isSkillInsufficient ? ' recipe-card--warning' : ''}`}
      style={{ position: 'relative' }}
    >
      {isSkillInsufficient ? (
        <Text
          size="xs"
          fw={700}
          style={{
            background: '#4a1f1f',
            color: '#ffdede',
            borderRadius: 6,
            padding: '4px 8px',
            alignSelf: 'flex-start',
          }}
        >
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
          style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}
          aria-label="Добавить крафт в избранное"
        >
          {isFavoriteCraft(recipeFavoriteId) ? '★' : '☆'}
        </ActionIcon>
      ) : null}

      {!hideRecipeTitle ? (
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={4} style={{ minWidth: 0 }}>
            {duplicateCraftTitle ? (
              <Text size="md" fw={700} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                {duplicateCraftTitle}
              </Text>
            ) : null}
            <Text size="sm" fw={600} c={duplicateCraftTitle ? 'dimmed' : undefined} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
              {getLocalizedLine(recipe.category.lines)}
              {recipe.subcategory?.lines ? ` / ${getLocalizedLine(recipe.subcategory.lines)}` : ''}
            </Text>
          </Stack>
        </Group>
      ) : null}

      {!hideResultSection ? (
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            Результат
          </Text>
          {resultItems.map((item) => (
            <Stack key={`result-${item.item}`} gap={4}>
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
              <AdminAuctionTrackingButton itemId={item.itemId} itemName={item.name} />
            </Stack>
          ))}
          {primaryResultItemId ? (
            <Group gap={8} wrap="nowrap" align="flex-start">
              <ActionIcon
                size={26}
                radius="md"
                variant={isCostTreeHovered ? 'filled' : 'light'}
                color={isCostTreeHovered ? 'blue' : 'gray'}
                aria-label="Открыть дерево крафтов"
                title="Открыть дерево крафтов"
                onClick={() => onOpenCostTree?.(primaryResultItemId)}
                onMouseEnter={() => setIsCostTreeHovered(true)}
                onMouseLeave={() => setIsCostTreeHovered(false)}
                style={{
                  backgroundColor: isCostTreeHovered ? undefined : 'rgba(255,255,255,0.10)',
                  transition: 'background-color 140ms ease, color 140ms ease, transform 140ms ease',
                  marginTop: 2,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 4V8M12 8L7 12M12 8L17 12M7 12V16M7 12L4 16M7 12L10 16M17 12V16M17 12L14 16M17 12L20 16"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="4" r="1.4" fill="currentColor" />
                  <circle cx="12" cy="8" r="1.4" fill="currentColor" />
                  <circle cx="7" cy="12" r="1.4" fill="currentColor" />
                  <circle cx="17" cy="12" r="1.4" fill="currentColor" />
                  <circle cx="4" cy="16" r="1.4" fill="currentColor" />
                  <circle cx="10" cy="16" r="1.4" fill="currentColor" />
                  <circle cx="14" cy="16" r="1.4" fill="currentColor" />
                  <circle cx="20" cy="16" r="1.4" fill="currentColor" />
                </svg>
              </ActionIcon>
              <Stack gap={2}>
                <Text size="xs" c="dimmed">
                  1) По цене скупа/крафта: {costLine1 ?? 'Недостаточно данных для расчета себестоимости'}
                </Text>
                <Text size="xs" c="dimmed">
                  2) По цене аукциона: {costLine2 ?? 'Заглушка (будет реализовано далее)'}
                </Text>
                <Text size="xs" c="dimmed">
                  3) Гибридный вариант: {costLine3 ?? 'Заглушка (будет реализовано далее)'}
                </Text>
              </Stack>
            </Group>
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

      {showCraftToggle ? (
        <Button
          variant="default"
          color="gray"
          size="xs"
          onClick={() => setIsCraftOpen((prev) => !prev)}
        >
          {isCraftOpen ? 'Скрыть крафт' : 'Показать крафт'}
        </Button>
      ) : null}

      {isCraftOpen || !showCraftToggle ? (
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            Ингредиенты
          </Text>
          <Stack gap="xs">
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
            <ItemBadge
              name="Энергия"
              amount={recipe.energy}
              iconUrl={energyIconSvg}
              qualityColor="DEFAULT"
              size="ingredient"
              disableGlow
            />
          </Stack>
        </Stack>
      ) : null}

      {canEditOverride ? (
        <Stack gap={6}>
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
                const safeBonus = Number.isFinite(parsedBonus) && parsedBonus >= 0 ? Number(parsedBonus.toFixed(3)) : 0
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
    </Stack>
  )
}
