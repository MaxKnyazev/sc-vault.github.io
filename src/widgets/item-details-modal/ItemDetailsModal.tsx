import { Alert, Loader, Modal, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { useHideoutStore } from '../../entities/hideout/store'
import { appConfig, type Realm } from '../../shared/config/app'
import { getLocalizedLine } from '../../shared/lib/getLocalizedLine'
import { useItemDetailsModalStore } from '../../shared/store/itemDetailsModalStore'
import { getItemName } from '../../entities/item/lib'
import { getQualityModalGlowBoxShadow } from '../../shared/lib/getQualityGlowColor'

type ItemDetailsResponse = {
  id: string
  category?: string
  color?: string
  status?: { state?: string }
  infoBlocks?: unknown[]
}

function getItemDataUrl(dataPath: string, realm: Realm): string {
  return `${appConfig.githubRawBaseUrl}/${realm}${dataPath}`
}

export function ItemDetailsModal() {
  const { opened, itemId, close } = useItemDetailsModalStore()
  const { itemsById, recipes, realm } = useHideoutStore()
  const [isLoading, setIsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [details, setDetails] = useState<ItemDetailsResponse | null>(null)

  const item = itemId ? itemsById[itemId] : undefined
  const itemName = getItemName(item?.name?.lines)

  const craftRecipes = useMemo(() => {
    if (!itemId) return []
    return recipes.filter((recipe) => recipe.result.some((entry) => entry.item === itemId))
  }, [itemId, recipes])

  const qualityForGlow = item?.color ?? details?.color
  const modalGlow = useMemo(() => getQualityModalGlowBoxShadow(qualityForGlow), [qualityForGlow])

  useEffect(() => {
    if (!opened || !itemId || !item?.data) {
      setDetails(null)
      setDetailsError(null)
      return
    }

    const controller = new AbortController()
    const fetchDetails = async () => {
      setIsLoading(true)
      setDetailsError(null)
      try {
        const response = await fetch(getItemDataUrl(item.data, realm), { signal: controller.signal })
        if (!response.ok) throw new Error(`Failed to load item details: ${response.status}`)
        const payload = (await response.json()) as ItemDetailsResponse
        setDetails(payload)
      } catch (error) {
        if (controller.signal.aborted) return
        setDetailsError(error instanceof Error ? error.message : 'Unknown error')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void fetchDetails()
    return () => controller.abort()
  }, [opened, itemId, item?.data, realm])

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={itemName || 'Информация о предмете'}
      centered
      size="lg"
      lockScroll={false}
      styles={{
        content: {
          boxShadow: modalGlow,
        },
      }}
    >
      <Stack gap="sm">
        {itemId ? (
          <>
            <Text size="sm">ID: {itemId}</Text>
            {details?.category ? <Text size="sm">Категория: {details.category}</Text> : null}
            {details?.status?.state ? <Text size="sm">Статус: {details.status.state}</Text> : null}
            <Text size="sm" c="dimmed">
              Доступных крафтов: {craftRecipes.length}
            </Text>
            {craftRecipes.map((recipe, index) => (
              <Stack key={`${recipe.bench}-${index}`} gap={2} p="xs" bd="1px solid var(--mantine-color-default-border)">
                <Text size="sm" fw={600}>
                  {getLocalizedLine(recipe.category.lines)}
                  {recipe.subcategory?.lines ? ` / ${getLocalizedLine(recipe.subcategory.lines)}` : ''}
                </Text>
                <Text size="xs" c="dimmed">
                  Результат: {recipe.result.map((entry) => `${entry.item} x${entry.amount}`).join(', ')}
                </Text>
                <Text size="xs" c="dimmed">
                  Ингредиенты: {recipe.ingredients.map((entry) => `${entry.item} x${entry.amount}`).join(', ')}
                </Text>
              </Stack>
            ))}
          </>
        ) : null}

        {isLoading ? <Loader size="sm" /> : null}
        {detailsError ? <Alert color="red">{detailsError}</Alert> : null}
      </Stack>
    </Modal>
  )
}
