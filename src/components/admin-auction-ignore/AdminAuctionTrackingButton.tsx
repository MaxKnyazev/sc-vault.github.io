import { ActionIcon, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useAuthStore } from '../../shared/store/authStore'
import { useAuctionBlacklistStore } from '../../shared/store/auctionBlacklistStore'
import { useAuctionPricesStore } from '../../shared/store/auctionPricesStore'
import { authModalGlowModalStyles } from '../../shared/lib/authModalGlowStyles'

type AdminAuctionTrackingButtonProps = {
  itemId: string
  itemName: string
}

type ModalIntent = 'ignore' | 'track' | null

export function AdminAuctionTrackingButton({ itemId, itemName }: AdminAuctionTrackingButtonProps) {
  const user = useAuthStore((s) => s.user)
  const isBlacklisted = useAuctionBlacklistStore((s) => s.blacklist.has(itemId))
  const addBlacklist = useAuctionBlacklistStore((s) => s.add)
  const removeBlacklist = useAuctionBlacklistStore((s) => s.remove)
  const removeFromCache = useAuctionPricesStore((s) => s.removeItemFromCache)
  const [intent, setIntent] = useState<ModalIntent>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user?.role !== 'admin') {
    return null
  }

  const closeModal = () => {
    if (!isSubmitting) {
      setIntent(null)
      setError(null)
    }
  }

  const confirm = async () => {
    if (!intent) return
    setError(null)
    setIsSubmitting(true)
    try {
      if (intent === 'ignore') {
        await addBlacklist(itemId)
        removeFromCache(itemId)
      } else {
        await removeBlacklist(itemId)
      }
      setIntent(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {isBlacklisted ? (
        <Button variant="subtle" color="gray" size="xs" onClick={() => setIntent('track')}>
          Отслеживать на аукционе
        </Button>
      ) : (
        <Button variant="subtle" color="gray" size="xs" onClick={() => setIntent('ignore')}>
          Не отслеживать на аукционе
        </Button>
      )}
      <Modal
        opened={intent !== null}
        onClose={closeModal}
        title={null}
        withCloseButton={false}
        centered
        size="sm"
        styles={authModalGlowModalStyles}
      >
        <Stack gap="sm">
          <Group justify="flex-end" mb={-4}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              onClick={closeModal}
              aria-label="Закрыть"
              disabled={isSubmitting}
            >
              ✕
            </ActionIcon>
          </Group>
          <Text size="sm">
            {intent === 'ignore' ? (
              <>Вы уверены, что хотите не отслеживать «{itemName}» на аукционе?</>
            ) : intent === 'track' ? (
              <>Вы уверены, что хотите снова отслеживать «{itemName}» на аукционе?</>
            ) : null}
          </Text>
          {error ? (
            <Text size="sm" c="red">
              {error}
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button variant="default" color="gray" disabled={isSubmitting} onClick={closeModal}>
              Отмена
            </Button>
            {intent === 'ignore' ? (
              <Button color="red" loading={isSubmitting} onClick={() => void confirm()}>
                Не отслеживать
              </Button>
            ) : intent === 'track' ? (
              <Button loading={isSubmitting} onClick={() => void confirm()}>
                Отслеживать
              </Button>
            ) : null}
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
