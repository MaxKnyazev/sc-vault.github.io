import {
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
import { AuctionRefreshToolbar } from '../../components/auction-refresh-toolbar/AuctionRefreshToolbar'
import { SectionCard } from '../../components/section-card/SectionCard'
import { RecipeCard } from '../../components/recipe-card/RecipeCard'
import { collectHideoutItemIds } from '../../shared/lib/collectHideoutItemIds'
import { getRecipeFavoriteId } from '../../shared/lib/getRecipeFavoriteId'
import { getLocalizedLine } from '../../shared/lib/getLocalizedLine'
import { getItemName } from '../../entities/item/lib'
import { useFavoritesStore } from '../../shared/store/favoritesStore'

export function RecipesOverview() {
  const { recipes, itemsById, realm, isLoading, error, fetchRecipes } = useHideoutStore()
  const favoriteCraftIds = useFavoritesStore((state) => state.favoriteCraftIds)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<'all' | 'favorites' | string>('all')

  useEffect(() => {
    void fetchRecipes()
  }, [fetchRecipes])

  const allCategories = useMemo(() => {
    return [...new Set(recipes.map((recipe) => getLocalizedLine(recipe.category.lines) || 'Без категории'))]
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

        const ingredientNames = recipe.ingredients
          .map((entry) => {
            const item = itemsById[entry.item]
            return `${entry.item} ${getItemName(item?.name?.lines)}`.toLowerCase()
          })
          .join(' ')

        if (!normalizedQuery) {
          matchPriority = 0
        } else if (resultNames.includes(normalizedQuery)) {
          // Highest priority: crafted item (recipe result) matches query.
          matchPriority = 0
        } else if (ingredientNames.includes(normalizedQuery)) {
          // Secondary priority: item participates as ingredient.
          matchPriority = 1
        }

        return { recipe, matchPriority, recipeFavoriteId }
      })
      .filter((entry) => entry.matchPriority !== null)

    const filtered = scoredRecipes.filter(({ recipe, recipeFavoriteId }) => {
      const categoryName = getLocalizedLine(recipe.category.lines) || 'Без категории'
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
      const categoryName = getLocalizedLine(recipe.category.lines) || 'Без категории'

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
            <AuctionRefreshToolbar itemIds={auctionItemIds} />
            <Group align="flex-end" wrap="wrap">
              <TextInput
                placeholder="Поиск: категория, станок, ID или название предмета..."
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                style={{ flex: 1, minWidth: 280 }}
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
                          recipe={recipe}
                          itemsById={itemsById}
                          realm={realm}
                          recipeFavoriteId={recipeFavoriteId}
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
