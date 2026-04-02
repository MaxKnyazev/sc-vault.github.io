import { Container } from '@mantine/core'
import type { PropsWithChildren } from 'react'

type PageContainerProps = PropsWithChildren<{
  size?: string | number
}>

export function PageContainer({ children }: PageContainerProps) {
  return <Container fluid px={0}>{children}</Container>
}
