import { Stack } from '@mantine/core'
import { PageContainer } from '../../components/page-container/PageContainer'
import { RecipesOverview } from '../../widgets/recipes-overview/RecipesOverview'

export function CraftsPage() {
  return (
    <PageContainer>
      <Stack gap="lg">
        <RecipesOverview />
      </Stack>
    </PageContainer>
  )
}
