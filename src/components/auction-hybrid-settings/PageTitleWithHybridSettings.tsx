import { ActionIcon, Group, Text, Tooltip } from '@mantine/core'
import { useState } from 'react'
import { useAuthStore } from '../../shared/store/authStore'
import { AuctionHybridSettingsModal } from './AuctionHybridSettingsModal'
import { IconSettings } from './IconSettings'

type Props = {
  title: string
  onSettingsSaved?: () => void
}

/** Заголовок страницы с иконкой шестерёнки для настроек гибридного аукциона. */
export function PageTitleWithHybridSettings({ title, onSettingsSaved }: Props) {
  const token = useAuthStore((s) => s.token)
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <Group gap={8} align="center" wrap="nowrap">
        <Text size="xl" fw={700} component="h1" style={{ margin: 0, lineHeight: 1.2 }}>
          {title}
        </Text>
        {token ? (
          <Tooltip label="Настройки аукциона для себестоимости" withArrow position="right">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              radius="md"
              aria-label="Настройки аукциона для себестоимости"
              onClick={() => setModalOpen(true)}
            >
              <IconSettings size={22} />
            </ActionIcon>
          </Tooltip>
        ) : null}
      </Group>

      <AuctionHybridSettingsModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={onSettingsSaved}
      />
    </>
  )
}
