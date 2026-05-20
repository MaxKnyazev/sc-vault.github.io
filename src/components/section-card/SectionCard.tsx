import { Card, Stack, Text, Title } from '@mantine/core'
import type { PropsWithChildren } from 'react'

type SectionCardProps = PropsWithChildren<{
  title: string
  description?: string
}>

export function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <Card className="section-card" withBorder={false} radius="md" padding="lg" h="100%">
      <Stack gap="md">
        {title || description ? (
          <Stack gap={4}>
            {title ? (
              <Title order={3} className="section-card__title">
                {title}
              </Title>
            ) : null}
            {description ? (
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            ) : null}
          </Stack>
        ) : null}
        {children}
      </Stack>
    </Card>
  )
}
