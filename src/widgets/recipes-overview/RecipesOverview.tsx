import {
  ActionIcon,
  Accordion,
  Alert,
  Button,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { useHideoutStore } from '../../entities/hideout/store'
import { AuctionRefreshStatus } from '../../components/auction-refresh-status/AuctionRefreshStatus'
import { SectionCard } from '../../components/section-card/SectionCard'
import { RecipeCard } from '../../components/recipe-card/RecipeCard'
import { collectHideoutItemIds } from '../../shared/lib/collectHideoutItemIds'
import { getRecipeFavoriteId } from '../../shared/lib/getRecipeFavoriteId'
import { getItemName } from '../../entities/item/lib'
import { useFavoritesStore } from '../../shared/store/favoritesStore'
import { useRecipeOverridesStore } from '../../shared/store/recipeOverridesStore'
import { applyRecipeResultOverride } from '../../shared/lib/applyRecipeResultOverride'
import type { HideoutRecipe } from '../../entities/hideout/types'
import { useAuthStore } from '../../shared/store/authStore'
import { getRecipeRequiredSkill } from '../../shared/lib/craftSkills'

const CANON_BRANCHES = [
  'Боеприпасы',
  'Пиротехника',
  'Защитное снаряжение',
  'Инженерия',
  'Кулинария',
  'Самогоноварение',
  'Медицина',
  'Сырье и материалы',
] as const
type CanonBranch = (typeof CANON_BRANCHES)[number]

const BRANCH_BY_PERK: Record<string, CanonBranch> = {
  ammunition: 'Боеприпасы',
  pyrotechnics: 'Пиротехника',
  armorer: 'Защитное снаряжение',
  engineering: 'Инженерия',
  cooking: 'Кулинария',
  brewing: 'Самогоноварение',
  medicine: 'Медицина',
  materials: 'Сырье и материалы',
}

function resolveRecipeCanonBranch(
  recipe: HideoutRecipe,
): CanonBranch | null {
  const required = getRecipeRequiredSkill(recipe)
  if (!required) return null
  return BRANCH_BY_PERK[required.perkId] ?? null
}

export function RecipesOverview() {
  const { recipes, itemsById, realm, isLoading, error, fetchRecipes } = useHideoutStore()
  const favoriteCraftIds = useFavoritesStore((state) => state.favoriteCraftIds)
  const craftBranchLevels = useAuthStore((s) => s.user?.craftBranchLevels ?? null)
  const recipeOverridesById = useRecipeOverridesStore((s) => s.byRecipeId)
  const loadOverrides = useRecipeOverridesStore((s) => s.loadOverrides)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<'all' | 'favorites' | string>('all')

  useEffect(() => {
    void fetchRecipes()
  }, [fetchRecipes])

  useEffect(() => {
    void loadOverrides()
  }, [loadOverrides])

  const allCategories = useMemo(() => {
    const set = new Set<CanonBranch>()
    for (const recipe of recipes) {
      const branch = resolveRecipeCanonBranch(recipe)
      if (branch) set.add(branch)
    }
    return CANON_BRANCHES.filter((branch) => set.has(branch))
  }, [recipes])

  const groupedRecipes = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase()

    const scoredRecipes = recipes
      .map((recipe) => {
        let matchPriority: number | null = null
        const recipeFavoriteId = getRecipeFavoriteId(recipe)

        const resultNames = recipe.result
          .map((entry) => {
            const item = itemsById[entry.item]
            return `${entry.item} ${getItemName(item?.name?.lines)}`.toLowerCase()
          })
          .join(' ')

        if (!normalizedQuery) {
          matchPriority = 0
        } else if (resultNames.includes(normalizedQuery)) {
          matchPriority = 0
        }

        return { recipe, matchPriority, recipeFavoriteId }
      })
      .filter((entry) => entry.matchPriority !== null)

    const filtered = scoredRecipes.filter(({ recipe, recipeFavoriteId }) => {
      const categoryName = resolveRecipeCanonBranch(recipe)
      if (!categoryName) {
        return false
      }
      if (
        activeCategory !== 'all' &&
        activeCategory !== 'favorites' &&
        categoryName !== activeCategory
      ) {
        return false
      }

      if (activeCategory === 'favorites') {
        if (!favoriteCraftIds.includes(recipeFavoriteId)) return false
      }

      return true
    })

    return filtered.reduce<Record<string, typeof filtered>>((acc, entry) => {
      const { recipe, matchPriority } = entry
      const categoryName = resolveRecipeCanonBranch(recipe)
      if (!categoryName) return acc

      if (!acc[categoryName]) {
        acc[categoryName] = []
      }

      if (matchPriority === 0) {
        acc[categoryName].unshift(entry)
      } else {
        acc[categoryName].push(entry)
      }
      return acc
    }, {})
  }, [activeCategory, favoriteCraftIds, itemsById, recipes, search])

  const categoryEntries = useMemo(() => Object.entries(groupedRecipes), [groupedRecipes])
  const defaultOpenedCategories = useMemo(
    () => categoryEntries.map(([category]) => category),
    [categoryEntries],
  )
  const auctionItemIds = useMemo(() => collectHideoutItemIds(recipes), [recipes])

  return (
    <SectionCard title="" description="">
      <Stack gap="xs">
        {isLoading ? (
          <Group gap="xs">
            <Loader size="sm" />
            <Text size="sm">Загрузка рецептов...</Text>
          </Group>
        ) : null}

        {error ? (
          <Alert color="red" title="Ошибка загрузки">
            {error}
          </Alert>
        ) : null}

        {!isLoading && !error ? (
          <>
            <Text size="xl" fw={700}>
              Крафты
            </Text>
            <AuctionRefreshStatus itemIds={auctionItemIds} />
            <Group align="flex-end" wrap="wrap">
              <TextInput
                placeholder="Поиск по названию итогового предмета..."
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                style={{ flex: 1, minWidth: 280 }}
                rightSection={
                  search ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      onClick={() => setSearch('')}
                      aria-label="Очистить поиск"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </ActionIcon>
                  ) : null
                }
              />
            </Group>

            <Group justify="center" gap="xs" wrap="wrap">
              <Button
                variant={activeCategory === 'all' ? 'filled' : 'default'}
                onClick={() => setActiveCategory('all')}
                style={{
                  whiteSpace: 'normal',
                  height: 'auto',
                  textAlign: 'center',
                  fontSize: 15,
                  padding: '10px 16px',
                  borderRadius: 12,
                  lineHeight: 1.2,
                }}
              >
                Все
              </Button>
              <Button
                variant={activeCategory === 'favorites' ? 'filled' : 'default'}
                onClick={() => setActiveCategory('favorites')}
                style={{
                  whiteSpace: 'normal',
                  height: 'auto',
                  textAlign: 'center',
                  fontSize: 15,
                  padding: '10px 16px',
                  borderRadius: 12,
                  lineHeight: 1.2,
                }}
              >
                Избранное
              </Button>
              {allCategories.map((category) => (
                <Button
                  key={category}
                  variant={activeCategory === category ? 'filled' : 'default'}
                  onClick={() => setActiveCategory(category)}
                  style={{
                    whiteSpace: 'normal',
                    height: 'auto',
                    textAlign: 'center',
                    fontSize: 15,
                    padding: '10px 16px',
                    borderRadius: 12,
                    lineHeight: 1.2,
                  }}
                >
                  {category}
                </Button>
              ))}
            </Group>
            <Accordion multiple defaultValue={defaultOpenedCategories} mt="xs">
              {categoryEntries.map(([categoryName, categoryRecipes]) => (
                <Accordion.Item key={categoryName} value={categoryName}>
                  <Accordion.Control>
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={600} style={{ wordBreak: 'break-word' }}>
                        {categoryName}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {categoryRecipes.length}
                      </Text>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="sm">
                      {categoryRecipes.map(({ recipe, recipeFavoriteId }, index) => (
                        <RecipeCard
                          key={`${categoryName}-${recipe.bench}-${index}`}
                          recipe={applyRecipeResultOverride(recipe, recipeOverridesById, craftBranchLevels)}
                          itemsById={itemsById}
                          realm={realm}
                          recipeFavoriteId={recipeFavoriteId}
                          showAdminOverrideControls
                        />
                      ))}
                    </SimpleGrid>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          </>
        ) : null}
      </Stack>
    </SectionCard>
  )
}
