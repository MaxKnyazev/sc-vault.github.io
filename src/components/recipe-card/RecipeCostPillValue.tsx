import { ActionIcon, Group, Text, Tooltip } from '@mantine/core'
import { parseRecipeCostLineDisplay } from '../../shared/lib/recipeCostLineDisplay'

type RecipeCostPillValueProps = {
  line: string
}

export function RecipeCostPillValue({ line }: RecipeCostPillValueProps) {
  const { preview, hint } = parseRecipeCostLineDisplay(line)

  return (
    <Group gap={6} wrap="nowrap" align="center" mt={8} className="recipe-cost-pill__value-row">
      <Text size="sm" fw={600} lh={1.4} className="recipe-cost-pill__value">
        {preview}
      </Text>
      {hint ? (
        <Tooltip
          label={hint}
          multiline
          w={300}
          withArrow
          color="dark"
          position="top"
          transitionProps={{ transition: 'fade', duration: 120 }}
        >
          <ActionIcon
            size="sm"
            radius="xl"
            variant="light"
            color="gray"
            className="recipe-cost-pill__hint"
            aria-label="Чего не хватает для расчёта"
          >
            ?
          </ActionIcon>
        </Tooltip>
      ) : null}
    </Group>
  )
}
