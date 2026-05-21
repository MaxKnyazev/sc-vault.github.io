import { Container } from '@mantine/core'
import type { PropsWithChildren } from 'react'

type PageContainerProps = PropsWithChildren<{
  size?: string | number
}>

export function PageContainer({ children }: PageContainerProps) {
  return (
    <Container fluid px={0} py={0} className="page-container">
      <div className="page-enter">{children}</div>
    </Container>
  )
}
