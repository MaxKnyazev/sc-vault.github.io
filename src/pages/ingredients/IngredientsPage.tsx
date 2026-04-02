import {
  Alert,
  Button,
  Group,
  Loader,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { useFavoritesStore } from '../../shared/store/favoritesStore'
import { useIngredientPricesStore } from '../../shared/store/ingredientPricesStore'

export function IngredientsPage() {
  const { recipes, itemsById, realm, isLoading, error, fetchRecipes } = useHideoutStore()
  const favoriteItemIds = useFavoritesStore((state) => state.favoriteItemIds)
  const { buyPricesByItemId, setBuyPrice } = useIngredientPricesStore()
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'base' | 'favorites'>('all')
  const [draftBuyPricesByItemId, setDraftBuyPricesByItemId] = useState<Record<string, string>>({})

  useEffect(() => {
    void fetchRecipes()
  }, [fetchRecipes])

  useEffect(() => {
    setDraftBuyPricesByItemId(buyPricesByItemId)
  }, [buyPricesByItemId])

  const ingredients = useMemo(() => {
    const ingredientIds = new Set<string>()
    const craftableResultIds = new Set<string>()

    recipes.forEach((recipe) => {
      recipe.ingredients.forEach((entry) => {
        ingredientIds.add(entry.item)
      })
      recipe.result.forEach((entry) => {
        craftableResultIds.add(entry.item)
      })
    })

    return [...ingredientIds]
      .map((itemId) => {
        const item = itemsById[itemId]
        return {
          itemId,
          name: getItemName(item?.name?.lines) || itemId,
          iconUrl: item ? buildItemIconUrl(item.icon, realm) : undefined,
          qualityColor: item?.color,
          isBase: !craftableResultIds.has(itemId),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [itemsById, recipes, realm])

  const filteredIngredients = useMemo(() => {
    const query = search.trim().toLowerCase()

    return ingredients.filter((item) => {
      if (activeFilter === 'base' && !item.isBase) return false
      if (activeFilter === 'favorites' && !favoriteItemIds.includes(item.itemId)) return false
      if (!query) return true

      const haystack = `${item.name} ${item.itemId}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [activeFilter, favoriteItemIds, ingredients, search])

  return (
    <PageContainer>
      <SectionCard title="" description="">
        <Stack gap="md" h="calc(100vh - 108px)">
          <Text size="xl" fw={700}>
            Ингредиенты
          </Text>

          {isLoading ? (
            <Stack gap="xs">
              <Loader size="sm" />
              <Text size="sm">Загрузка ингредиентов...</Text>
            </Stack>
          ) : null}

          {error ? (
            <Alert color="red" title="Ошибка загрузки">
              {error}
            </Alert>
          ) : null}

          {!isLoading && !error ? (
            <ScrollArea
              flex={1}
              type="auto"
              offsetScrollbars
              viewportProps={{ style: { padding: '10px 12px 16px' } }}
            >
              <Stack gap="md" mb="lg">
                <Group align="flex-end" wrap="wrap">
                  <TextInput
                    placeholder="Поиск: название или ID ингредиента..."
                    value={search}
                    onChange={(event) => setSearch(event.currentTarget.value)}
                    style={{ flex: 1, minWidth: 280 }}
                  />
                </Group>

                <Group justify="center" gap="xs" wrap="wrap">
                  <Button
                    variant={activeFilter === 'all' ? 'filled' : 'default'}
                    onClick={() => setActiveFilter('all')}
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
                    variant={activeFilter === 'base' ? 'filled' : 'default'}
                    onClick={() => setActiveFilter('base')}
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
                    Базовые ингредиенты
                  </Button>
                  <Button
                    variant={activeFilter === 'favorites' ? 'filled' : 'default'}
                    onClick={() => setActiveFilter('favorites')}
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
                </Group>
              </Stack>

              <SimpleGrid cols={{ base: 1, sm: 2, md: 3, xl: 4 }} spacing="lg" verticalSpacing="lg">
                {filteredIngredients.map((item) => (
                  <Stack
                    key={item.itemId}
                    gap={8}
                    p="md"
                    bd="1px solid var(--mantine-color-dark-4)"
                    style={{ borderRadius: 8 }}
                  >
                    <ItemBadge
                      itemId={item.itemId}
                      name={item.name}
                      iconUrl={item.iconUrl}
                      qualityColor={item.qualityColor}
                      size="result"
                    />
                    <Text size="sm" c="dimmed">
                      Средняя цена аукциона:
                    </Text>
                    <Group wrap="nowrap" align="flex-end">
                      <TextInput
                        placeholder="Цена скупа за 1 ед."
                        value={draftBuyPricesByItemId[item.itemId] ?? ''}
                        onChange={(event) => {
                          const raw = event.currentTarget.value
                          const sanitized = raw.replace(/[^\d]/g, '')
                          setDraftBuyPricesByItemId((state) => ({
                            ...state,
                            [item.itemId]: sanitized,
                          }))
                        }}
                        style={{ flex: 1 }}
                      />
                      <Button
                        variant="default"
                        color="gray"
                        onClick={() => {
                          const value = (draftBuyPricesByItemId[item.itemId] ?? '').replace(/[^\d]/g, '')
                          setBuyPrice(item.itemId, value)
                        }}
                      >
                        Сохранить
                      </Button>
                    </Group>
                  </Stack>
                ))}
              </SimpleGrid>
            </ScrollArea>
          ) : null}
        </Stack>
      </SectionCard>
    </PageContainer>
  )
}
