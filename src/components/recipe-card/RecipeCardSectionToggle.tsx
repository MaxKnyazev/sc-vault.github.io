import { Group, Text, UnstyledButton } from '@mantine/core'

type RecipeCardSectionToggleProps = {
  expanded: boolean
  label: string
  count: number
  onToggle: () => void
}

export function RecipeCardSectionToggle({ expanded, label, count, onToggle }: RecipeCardSectionToggleProps) {
  return (
    <UnstyledButton
      className="recipe-card__section-toggle"
      onClick={onToggle}
      aria-expanded={expanded}
    >
      <Group gap={6} wrap="nowrap">
        <Text
          size="xs"
          c="dimmed"
          style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 160ms ease',
            lineHeight: 1,
          }}
          aria-hidden
        >
          ›
        </Text>
        <Text size="sm" fw={600}>
          {label}
        </Text>
        <Text size="xs" c="dimmed">
          ({count})
        </Text>
      </Group>
    </UnstyledButton>
  )
}
