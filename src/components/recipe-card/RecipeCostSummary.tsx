import { ActionIcon, Box, Button, Group, Stack, Text } from '@mantine/core'
import { useState } from 'react'
import { parseRecipeCostLineDisplay } from '../../shared/lib/recipeCostLineDisplay'
import { RecipeCostPillValue } from './RecipeCostPillValue'

type RecipeCostSummaryProps = {
  buyCraftLine: string
  hybridLine: string
  onOpenCostTree?: () => void
}

export function RecipeCostSummary({ buyCraftLine, hybridLine, onOpenCostTree }: RecipeCostSummaryProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const buyParsed = parseRecipeCostLineDisplay(buyCraftLine)
  const hybridParsed = parseRecipeCostLineDisplay(hybridLine)
  const hasDetails =
    (!buyParsed.isInsufficient && buyCraftLine !== buyParsed.preview) ||
    (!hybridParsed.isInsufficient && hybridLine !== hybridParsed.preview) ||
    (!buyParsed.isInsufficient && buyCraftLine.length > 48) ||
    (!hybridParsed.isInsufficient && hybridLine.length > 48)

  return (
    <Stack gap={8} className="recipe-cost-summary">
      <Group gap={8} wrap="nowrap" align="stretch" grow preventGrowOverflow={false}>
        <Box className="recipe-cost-pill">
          <Text component="span" className="recipe-cost-pill__label">
            Скуп / крафт
          </Text>
          <RecipeCostPillValue line={buyCraftLine} />
        </Box>
        <Box className="recipe-cost-pill recipe-cost-pill--hybrid">
          <Text component="span" className="recipe-cost-pill__label recipe-cost-pill__label--hybrid">
            Гибрид
          </Text>
          <RecipeCostPillValue line={hybridLine} />
        </Box>
      </Group>

      <Group gap={6} wrap="nowrap">
        {onOpenCostTree ? (
          <ActionIcon
            size="md"
            radius="md"
            variant="light"
            color="gray"
            aria-label="Дерево крафтов"
            title="Дерево крафтов"
            onClick={onOpenCostTree}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 4V8M12 8L7 12M12 8L17 12M7 12V16M7 12L4 16M7 12L10 16M17 12V16M17 12L14 16M17 12L20 16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="4" r="1.4" fill="currentColor" />
              <circle cx="12" cy="8" r="1.4" fill="currentColor" />
              <circle cx="7" cy="12" r="1.4" fill="currentColor" />
              <circle cx="17" cy="12" r="1.4" fill="currentColor" />
              <circle cx="4" cy="16" r="1.4" fill="currentColor" />
              <circle cx="10" cy="16" r="1.4" fill="currentColor" />
              <circle cx="14" cy="16" r="1.4" fill="currentColor" />
              <circle cx="20" cy="16" r="1.4" fill="currentColor" />
            </svg>
          </ActionIcon>
        ) : null}
        {hasDetails ? (
          <Button
            variant="subtle"
            color="gray"
            size="compact-xs"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? 'Скрыть детали' : 'Детали расчёта'}
          </Button>
        ) : null}
      </Group>

      {detailsOpen && hasDetails ? (
        <Stack gap={8} className="recipe-cost-details">
          <Box>
            <Text size="xs" c="dimmed" fw={600} mb={4}>
              Скуп / крафт
            </Text>
            <Text size="xs" c="dimmed" lh={1.45} style={{ wordBreak: 'break-word' }}>
              {buyCraftLine}
            </Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed" fw={600} mb={4}>
              Гибрид
            </Text>
            <Text size="xs" c="dimmed" lh={1.45} style={{ wordBreak: 'break-word' }}>
              {hybridLine}
            </Text>
          </Box>
        </Stack>
      ) : null}
    </Stack>
  )
}
