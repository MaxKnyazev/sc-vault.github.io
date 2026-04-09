import { Alert, Avatar, Button, Group, ScrollArea, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { PageContainer } from '../../components/page-container/PageContainer'
import { SectionCard } from '../../components/section-card/SectionCard'
import { useAuthStore } from '../../shared/store/authStore'
import { getRoleLabel } from '../../shared/lib/authRole'
import { useHideoutStore } from '../../entities/hideout/store'
import { getRecipeFavoriteId } from '../../shared/lib/getRecipeFavoriteId'
import { getItemName } from '../../entities/item/lib'
import { useRecipeOverridesStore } from '../../shared/store/recipeOverridesStore'
import type { RecipeResultOverride } from '../../shared/api/backendApi'

function parseCsvOverrides(csv: string): Array<Omit<RecipeResultOverride, 'updatedAt'>> {
  const rows = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const result: Array<Omit<RecipeResultOverride, 'updatedAt'>> = []
  for (const row of rows) {
    if (row.toLowerCase().startsWith('recipeid,')) continue
    const [recipeId = '', resultItemId = '', baseAmountRaw = '', bonusAmountRaw = ''] = row
      .split(',')
      .map((part) => part.trim())
    if (!recipeId || !resultItemId) continue
    const baseAmount = baseAmountRaw === '' ? null : Number.parseInt(baseAmountRaw, 10)
    const bonusAmount = bonusAmountRaw === '' ? null : Number.parseInt(bonusAmountRaw, 10)
    result.push({
      recipeId,
      resultItemId,
      baseAmount: Number.isFinite(baseAmount) ? baseAmount : null,
      bonusAmount: Number.isFinite(bonusAmount) ? bonusAmount : null,
    })
  }
  return result
}

export function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const isSubmitting = useAuthStore((s) => s.isSubmitting)
  const { recipes, itemsById, fetchRecipes } = useHideoutStore()
  const recipeOverridesById = useRecipeOverridesStore((s) => s.byRecipeId)
  const loadOverrides = useRecipeOverridesStore((s) => s.loadOverrides)
  const saveOne = useRecipeOverridesStore((s) => s.saveOne)
  const saveBulk = useRecipeOverridesStore((s) => s.saveBulk)
  const isSavingOverrides = useRecipeOverridesStore((s) => s.isSaving)
  const overridesError = useRecipeOverridesStore((s) => s.error)
  const resetOverridesError = useRecipeOverridesStore((s) => s.resetError)
  const roleGlowColor =
    user?.role === 'admin' ? '#ef4444' : user?.role === 'user' ? '#3b82f6' : '#ffffff'
  const [search, setSearch] = useState('')
  const [csvInput, setCsvInput] = useState('')
  const [draftByRecipeId, setDraftByRecipeId] = useState<Record<string, string>>({})
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null)

  if (!user) return null

  useEffect(() => {
    void fetchRecipes()
    void loadOverrides()
  }, [fetchRecipes, loadOverrides])

  const adminRows = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase()
    return recipes
      .map((recipe) => {
        const recipeId = getRecipeFavoriteId(recipe)
        const primaryResult = recipe.result[0]
        const resultItemName = primaryResult
          ? getItemName(itemsById[primaryResult.item]?.name?.lines) || primaryResult.item
          : recipeId
        const override = recipeOverridesById[recipeId]
        return {
          recipeId,
          resultItemId: primaryResult?.item ?? '',
          resultItemName,
          apiAmount: primaryResult?.amount ?? 0,
          overrideAmount: override?.baseAmount ?? null,
        }
      })
      .filter((row) => {
        if (!normalizedQuery) return true
        return `${row.resultItemName} ${row.resultItemId} ${row.recipeId}`
          .toLowerCase()
          .includes(normalizedQuery)
      })
      .slice(0, 120)
  }, [itemsById, recipeOverridesById, recipes, search])

  const handleSaveOne = async (
    recipeId: string,
    resultItemId: string,
    fallbackApiAmount: number,
  ): Promise<void> => {
    setAdminSuccess(null)
    resetOverridesError()
    const raw = draftByRecipeId[recipeId]
    const parsed = raw && raw.trim() !== '' ? Number.parseInt(raw, 10) : fallbackApiAmount
    await saveOne({
      recipeId,
      resultItemId,
      baseAmount: Number.isFinite(parsed) ? parsed : fallbackApiAmount,
      bonusAmount: recipeOverridesById[recipeId]?.bonusAmount ?? null,
    })
    setAdminSuccess('Изменение сохранено')
  }

  const handleBulkImport = async (): Promise<void> => {
    setAdminSuccess(null)
    resetOverridesError()
    const items = parseCsvOverrides(csvInput)
    if (items.length === 0) {
      setAdminSuccess('CSV пуст или не содержит валидных строк')
      return
    }
    const updated = await saveBulk(items)
    setAdminSuccess(`Импортировано записей: ${updated}`)
  }

  return (
    <PageContainer>
      <SectionCard title="" description="">
        <Stack gap="md">
          <Text size="xl" fw={700}>
            Личный кабинет
          </Text>
          <Group wrap="nowrap">
            <Avatar
              radius="xl"
              size={48}
              src={user.avatarUrl ?? undefined}
              name={user.nickname}
              color="gray"
              style={{
                backgroundColor: 'rgba(0,0,0,0.28)',
                border: `1px solid ${roleGlowColor}`,
                boxShadow: `0 0 10px ${roleGlowColor}`,
              }}
            />
            <Stack gap={2}>
              <Text fw={700} size="lg">
                {user.nickname}
              </Text>
              <Text size="sm" c="dimmed">
                {getRoleLabel(user.role)}
              </Text>
            </Stack>
          </Group>

          <Group justify="flex-end">
            <Button loading={isSubmitting} variant="default" color="gray" onClick={() => void logout()}>
              Выйти
            </Button>
          </Group>

          {user.role === 'admin' ? (
            <Stack gap="sm" mt="sm">
              <Text fw={700}>Админка: ручные количества крафтов</Text>
              <Text size="sm" c="dimmed">
                Эти значения глобальные и применяются для всех пользователей сайта.
              </Text>

              <TextInput
                placeholder="Поиск по названию, itemId или recipeId..."
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />

              <ScrollArea.Autosize mah={320}>
                <Stack gap="xs">
                  {adminRows.map((row) => (
                    <Group
                      key={row.recipeId}
                      justify="space-between"
                      align="flex-end"
                      wrap="nowrap"
                      p="xs"
                      style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}
                    >
                      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                        <Text fw={600} truncate>
                          {row.resultItemName}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          itemId: {row.resultItemId}
                        </Text>
                        <Text size="xs" c="dimmed">
                          API: {row.apiAmount} | Override:{' '}
                          {row.overrideAmount === null ? 'нет' : row.overrideAmount}
                        </Text>
                      </Stack>
                      <Group gap="xs" wrap="nowrap">
                        <TextInput
                          w={110}
                          placeholder={String(row.apiAmount)}
                          value={
                            draftByRecipeId[row.recipeId] ??
                            (row.overrideAmount !== null ? String(row.overrideAmount) : '')
                          }
                          onChange={(event) =>
                            setDraftByRecipeId((state) => ({
                              ...state,
                              [row.recipeId]: event.currentTarget.value.replace(/[^\d]/g, ''),
                            }))
                          }
                        />
                        <Button
                          size="xs"
                          loading={isSavingOverrides}
                          onClick={() => void handleSaveOne(row.recipeId, row.resultItemId, row.apiAmount)}
                        >
                          Сохранить
                        </Button>
                      </Group>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea.Autosize>

              <Stack gap={6}>
                <Text fw={600} size="sm">
                  Импорт CSV
                </Text>
                <Text size="xs" c="dimmed">
                  Формат: recipeId,resultItemId,baseAmount,bonusAmount
                </Text>
                <Textarea
                  minRows={6}
                  placeholder="recipeId,resultItemId,baseAmount,bonusAmount"
                  value={csvInput}
                  onChange={(event) => setCsvInput(event.currentTarget.value)}
                />
                <Group justify="flex-end">
                  <Button loading={isSavingOverrides} onClick={() => void handleBulkImport()}>
                    Импортировать CSV
                  </Button>
                </Group>
              </Stack>

              {adminSuccess ? <Alert color="green">{adminSuccess}</Alert> : null}
              {overridesError ? <Alert color="red">{overridesError}</Alert> : null}
            </Stack>
          ) : null}
        </Stack>
      </SectionCard>
    </PageContainer>
  )
}

