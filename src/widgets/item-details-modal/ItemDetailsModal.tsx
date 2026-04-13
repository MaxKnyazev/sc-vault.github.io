import { ActionIcon, Box, Group, Modal, Stack } from '@mantine/core'
import { useMemo } from 'react'
import { ItemBadge } from '../../components/item-badge/ItemBadge'
import { useHideoutStore } from '../../entities/hideout/store'
import { buildItemIconUrl, getItemName } from '../../entities/item/lib'
import { useItemDetailsModalStore } from '../../shared/store/itemDetailsModalStore'
import { getQualityModalGlowBoxShadow } from '../../shared/lib/getQualityGlowColor'

export function ItemDetailsModal() {
  const { opened, itemId, close } = useItemDetailsModalStore()
  const { itemsById, realm } = useHideoutStore()

  const item = itemId ? itemsById[itemId] : undefined
  const itemName = getItemName(item?.name?.lines)
  const iconUrl = item ? buildItemIconUrl(item.icon, realm) : undefined
  const qualityForGlow = item?.color
  const modalGlow = useMemo(() => getQualityModalGlowBoxShadow(qualityForGlow), [qualityForGlow])

  const closeModal = () => close()

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      title={null}
      withCloseButton={false}
      centered
      size="sm"
      styles={{
        content: {
          boxShadow: modalGlow,
          overflow: 'visible',
        },
      }}
    >
      <Stack gap="sm">
        {itemId ? (
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Box style={{ flex: 1, minWidth: 0 }}>
              <ItemBadge
                itemId={itemId}
                name={itemName || itemId}
                iconUrl={iconUrl}
                qualityColor={item?.color}
                size="result"
                showFavoriteButton={false}
              />
            </Box>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              onClick={closeModal}
              aria-label="Закрыть"
              style={{ marginTop: 2, marginLeft: 4 }}
            >
              ✕
            </ActionIcon>
          </Group>
        ) : null}
      </Stack>
    </Modal>
  )
}
