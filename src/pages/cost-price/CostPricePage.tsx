import { Alert, Loader, SimpleGrid, Stack, Text } from '@mantine/core'
import { useEffect, useMemo } from 'react'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { applyRecipeResultOverride } from '../../shared/lib/applyRecipeResultOverride'
import { useRecipeOverridesStore } from '../../shared/store/recipeOverridesStore'
import { useAuthStore } from '../../shared/store/authStore'
import { useIngredientPricesStore } from '../../shared/store/ingredientPricesStore'
import { formatAuctionRub } from '../../shared/lib/formatAuctionPrice'
import type { HideoutRecipe } from '../../entities/hideout/types'

type CostResolvedCard = {
  itemId: string
  amount: number
  name: string
  iconUrl?: string
  qualityColor?: string
  craftCostPerUnit: number | null
  buyCostPerUnit: number | null
  effectiveCostPerUnit: number | null
  status: 'ok' | 'insufficient' | 'cycle'
  statusMessage?: string
}

function parsePositiveNumber(raw: string | null | undefined): number | null {
  if (!raw) return null
  const normalized = raw.replace(',', '.').trim()
  if (normalized === '') return null
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function buildCraftCostModel(
  recipes: HideoutRecipe[],
  buyPricesByItemId: Record<string, string>,
  energyPriceRaw: string,
): {
  effectiveCostByItemId: Map<string, number>
  craftCostByItemId: Map<string, number>
  outputAmountByItemId: Map<string, number>
  cyclicItemIds: Set<string>
  unresolvedItemIds: Set<string>
} {
  const buyCostByItemId = new Map<string, number>()
  for (const [itemId, raw] of Object.entries(buyPricesByItemId)) {
    const parsed = parsePositiveNumber(raw)
    if (parsed !== null) {
      buyCostByItemId.set(itemId, parsed)
    }
  }
  const energyCost = parsePositiveNumber(energyPriceRaw)

  const effectiveCostByItemId = new Map<string, number>(buyCostByItemId)
  const craftCostByItemId = new Map<string, number>()
  const outputAmountByItemId = new Map<string, number>()
  const cyclicItemIds = new Set<string>()

  // Build craft dependency graph: result item -> ingredient item (craftable only).
  const graph = new Map<string, Set<string>>()
  const craftableSet = new Set<string>()
  for (const recipe of recipes) {
    for (const entry of recipe.result) {
      if (entry.amount > 0) craftableSet.add(entry.item)
    }
  }
  for (const recipe of recipes) {
    for (const result of recipe.result) {
      if (result.amount <= 0) continue
      if (!graph.has(result.item)) graph.set(result.item, new Set<string>())
      for (const ingredient of recipe.ingredients) {
        if (craftableSet.has(ingredient.item)) {
          graph.get(result.item)!.add(ingredient.item)
        }
      }
    }
  }

  const visitState = new Map<string, 0 | 1 | 2>()
  const path: string[] = []
  const dfs = (node: string) => {
    const state = visitState.get(node) ?? 0
    if (state === 1) {
      const idx = path.lastIndexOf(node)
      if (idx >= 0) {
        for (let i = idx; i < path.length; i += 1) cyclicItemIds.add(path[i]!)
      }
      cyclicItemIds.add(node)
      return
    }
    if (state === 2) return
    visitState.set(node, 1)
    path.push(node)
    const next = graph.get(node) ?? new Set<string>()
    for (const child of next) dfs(child)
    path.pop()
    visitState.set(node, 2)
  }
  for (const node of graph.keys()) dfs(node)

  const maxIterations = Math.max(1, recipes.length * 4)
  for (let iter = 0; iter < maxIterations; iter += 1) {
    let changed = false
    for (const recipe of recipes) {
      let totalInputCost = 0
      let canResolve = true
      for (const ingredient of recipe.ingredients) {
        const perUnit = effectiveCostByItemId.get(ingredient.item)
        if (perUnit === undefined) {
          canResolve = false
          break
        }
        totalInputCost += perUnit * ingredient.amount
      }
      if (!canResolve) continue
      if (recipe.energy > 0) {
        if (energyCost === null) {
          continue
        }
        totalInputCost += energyCost * recipe.energy
      }
      for (const resultEntry of recipe.result) {
        if (resultEntry.amount <= 0) continue
        const craftPerUnit = totalInputCost / resultEntry.amount
        const prevCraft = craftCostByItemId.get(resultEntry.item)
        if (prevCraft === undefined || craftPerUnit < prevCraft) {
          craftCostByItemId.set(resultEntry.item, craftPerUnit)
          outputAmountByItemId.set(resultEntry.item, resultEntry.amount)
          changed = true
        }
        const buyPerUnit = buyCostByItemId.get(resultEntry.item)
        const nextEffective =
          buyPerUnit === undefined
            ? craftCostByItemId.get(resultEntry.item)!
            : Math.min(buyPerUnit, craftCostByItemId.get(resultEntry.item)!)
        const prevEffective = effectiveCostByItemId.get(resultEntry.item)
        if (prevEffective === undefined || Math.abs(prevEffective - nextEffective) > 1e-9) {
          effectiveCostByItemId.set(resultEntry.item, nextEffective)
          changed = true
        }
      }
    }
    if (!changed) break
  }

  // Cycle guard: if node is cyclic and has no explicit buy anchor, don't trust propagated value.
  for (const itemId of cyclicItemIds) {
    if (!buyCostByItemId.has(itemId)) {
      effectiveCostByItemId.delete(itemId)
    }
  }

  const unresolvedItemIds = new Set<string>()
  for (const id of craftableSet) {
    if (!effectiveCostByItemId.has(id)) unresolvedItemIds.add(id)
  }

  return { effectiveCostByItemId, craftCostByItemId, outputAmountByItemId, cyclicItemIds, unresolvedItemIds }
}

export function CostPricePage() {
  const { recipes, itemsById, realm, isLoading, error, fetchRecipes } = useHideoutStore()
  const recipeOverridesById = useRecipeOverridesStore((s) => s.byRecipeId)
  const loadOverrides = useRecipeOverridesStore((s) => s.loadOverrides)
  const craftBranchLevels = useAuthStore((s) => s.user?.craftBranchLevels ?? null)
  const buyPricesByItemId = useIngredientPricesStore((s) => s.buyPricesByItemId)
  const energyPrice = useIngredientPricesStore((s) => s.energyPrice)
  const loadRemoteBuyPrices = useIngredientPricesStore((s) => s.loadRemoteBuyPrices)

  useEffect(() => {
    void fetchRecipes()
  }, [fetchRecipes])

  useEffect(() => {
    void loadOverrides()
  }, [loadOverrides])

  useEffect(() => {
    void loadRemoteBuyPrices()
  }, [loadRemoteBuyPrices])

  const craftedItems = useMemo<CostResolvedCard[]>(() => {
    const adjustedRecipes = recipes.map((recipe) =>
      applyRecipeResultOverride(recipe, recipeOverridesById, craftBranchLevels),
    )
    const { effectiveCostByItemId, craftCostByItemId, outputAmountByItemId, cyclicItemIds, unresolvedItemIds } = buildCraftCostModel(
      adjustedRecipes,
      buyPricesByItemId,
      energyPrice,
    )

    const craftableItemIds = new Set<string>()
    for (const recipe of adjustedRecipes) {
      for (const entry of recipe.result) {
        if (entry.amount > 0) craftableItemIds.add(entry.item)
      }
    }

    return [...craftableItemIds]
      .map((itemId) => {
        const item = itemsById[itemId]
        const amount = outputAmountByItemId.get(itemId) ?? 1
        const buyCostPerUnit = parsePositiveNumber(buyPricesByItemId[itemId] ?? null)
        const craftCostPerUnit = craftCostByItemId.get(itemId) ?? null
        const effectiveCostPerUnit = effectiveCostByItemId.get(itemId) ?? null
        let status: CostResolvedCard['status'] = 'ok'
        let statusMessage: string | undefined
        if (effectiveCostPerUnit === null) {
          status = cyclicItemIds.has(itemId) ? 'cycle' : 'insufficient'
          statusMessage =
            status === 'cycle'
              ? 'Недостаточно данных для расчета себестоимости (обнаружен цикл зависимостей без цены скупа)'
              : 'Недостаточно данных для расчета себестоимости'
        } else if (cyclicItemIds.has(itemId)) {
          status = 'cycle'
          statusMessage = 'Рассчитано с учетом цикла (использован якорь цены скупа)'
        } else if (unresolvedItemIds.has(itemId)) {
          status = 'insufficient'
          statusMessage = 'Недостаточно данных для расчета себестоимости'
        }
        return {
          itemId,
          amount,
          name: getItemName(item?.name?.lines) || itemId,
          iconUrl: item ? buildItemIconUrl(item.icon, realm) : undefined,
          qualityColor: item?.color,
          buyCostPerUnit,
          craftCostPerUnit,
          effectiveCostPerUnit,
          status,
          statusMessage,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [recipes, recipeOverridesById, craftBranchLevels, itemsById, realm, buyPricesByItemId, energyPrice])

  return (
    <PageContainer>
      <SectionCard title="" description="">
        <Stack gap="md">
          <Text size="xl" fw={700}>
            Себестоимость
          </Text>

          {isLoading ? (
            <Stack gap="xs">
              <Loader size="sm" />
              <Text size="sm">Загрузка крафтовых предметов...</Text>
            </Stack>
          ) : null}

          {error ? (
            <Alert color="red" title="Ошибка загрузки">
              {error}
            </Alert>
          ) : null}

          {!isLoading && !error ? (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3, xl: 4 }} spacing="sm" verticalSpacing="sm">
              {craftedItems.map((item) => (
                <Stack
                  key={item.itemId}
                  gap={6}
                  p="md"
                  bd="1px solid var(--mantine-color-default-border)"
                  style={{ borderRadius: 8 }}
                >
                  <ItemBadge
                    itemId={item.itemId}
                    name={item.name}
                    iconUrl={item.iconUrl}
                    amount={item.amount}
                    qualityColor={item.qualityColor}
                    size="result"
                  />
                  <Text size="xs" c="dimmed">
                    1) По цене скупа/крафта:{' '}
                    {item.effectiveCostPerUnit !== null
                      ? `${formatAuctionRub(item.effectiveCostPerUnit)} ₽/шт`
                      : 'Недостаточно данных для расчета себестоимости'}
                  </Text>
                  {item.statusMessage ? (
                    <Text size="xs" c={item.status === 'cycle' ? 'yellow' : 'dimmed'}>
                      {item.statusMessage}
                    </Text>
                  ) : null}
                  <Text size="xs" c="dimmed">
                    {item.effectiveCostPerUnit !== null
                      ? `   · Скуп: ${item.buyCostPerUnit !== null ? `${formatAuctionRub(item.buyCostPerUnit)} ₽/шт` : '—'} · Крафт: ${item.craftCostPerUnit !== null ? `${formatAuctionRub(item.craftCostPerUnit)} ₽/шт` : '—'}`
                      : ''}
                  </Text>
                  <Text size="xs" c="dimmed">
                    2) По цене аукциона: Заглушка (будет реализовано далее)
                  </Text>
                  <Text size="xs" c="dimmed">
                    3) Гибридный вариант: Заглушка (будет реализовано далее)
                  </Text>
                </Stack>
              ))}
            </SimpleGrid>
          ) : null}
        </Stack>
      </SectionCard>
    </PageContainer>
  )
}
