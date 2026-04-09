import { Button, Center, Stack, Text, Title } from '@mantine/core'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'SCTool - Страница не найдена'
  }, [])

  return (
    <Center mih="100vh">
      <Stack align="center" gap="xs">
        <Title order={1}>404</Title>
        <Text c="dimmed">Страница не найдена</Text>
        <Button component={Link} to="/">
          На главную
        </Button>
      </Stack>
    </Center>
  )
}
