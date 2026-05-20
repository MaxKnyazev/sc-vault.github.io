import { Container } from '@mantine/core'
import type { PropsWithChildren } from 'react'

type PageContainerProps = PropsWithChildren<{
  size?: string | number
}>

export function PageContainer({ children }: PageContainerProps) {
  return (
    <Container fluid px="md" py="sm" className="page-container">
      <div className="page-enter">{children}</div>
    </Container>
  )
}
