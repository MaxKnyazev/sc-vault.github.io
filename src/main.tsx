import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import App from './App.tsx'
import './styles/global.scss'
import { appTheme } from './shared/theme/mantineTheme.ts'

try {
  localStorage.removeItem('sc-vault-color-scheme')
} catch {
  /* ignore */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={appTheme} forceColorScheme="dark">
      <App />
    </MantineProvider>
  </StrictMode>,
)
