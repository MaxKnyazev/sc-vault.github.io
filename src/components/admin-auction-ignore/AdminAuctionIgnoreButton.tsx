import { ActionIcon, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { useAuthStore } from '../../shared/store/authStore'
import { useAuctionBlacklistStore } from '../../shared/store/auctionBlacklistStore'
import { useAuctionPricesStore } from '../../shared/store/auctionPricesStore'
import { authModalGlowModalStyles } from '../../shared/lib/authModalGlowStyles'

type AdminAuctionIgnoreButtonProps = {
  itemId: string
  itemName: string
}

export function AdminAuctionIgnoreButton({ itemId, itemName }: AdminAuctionIgnoreButtonProps) {
  const user = useAuthStore((s) => s.user)
  const isBlacklisted = useAuctionBlacklistStore((s) => s.blacklist.has(itemId))
  const addBlacklist = useAuctionBlacklistStore((s) => s.add)
  const removeFromCache = useAuctionPricesStore((s) => s.removeItemFromCache)
  const [opened, setOpened] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user?.role !== 'admin' || isBlacklisted) {
    return null
  }

  const confirm = async () => {
    setError(null)
    setIsSubmitting(true)
    try {
      await addBlacklist(itemId)
      removeFromCache(itemId)
      setOpened(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button variant="subtle" color="gray" size="xs" onClick={() => setOpened(true)}>
        Не отслеживать на аукционе
      </Button>
      <Modal
        opened={opened}
        onClose={() => {
          if (!isSubmitting) {
            setOpened(false)
            setError(null)
          }
        }}
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
              onClick={() => {
                if (!isSubmitting) {
                  setOpened(false)
                  setError(null)
                }
              }}
              aria-label="Закрыть"
            >
              ✕
            </ActionIcon>
          </Group>
          <Text size="sm">
            Вы уверены, что хотите не отслеживать «{itemName}» на аукционе?
          </Text>
          {error ? (
            <Text size="sm" c="red">
              {error}
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button
              variant="default"
              color="gray"
              disabled={isSubmitting}
              onClick={() => {
                setOpened(false)
                setError(null)
              }}
            >
              Отмена
            </Button>
            <Button color="red" loading={isSubmitting} onClick={() => void confirm()}>
              Не отслеживать
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
