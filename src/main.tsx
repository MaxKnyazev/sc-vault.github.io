import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { localStorageColorSchemeManager, MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import App from './App.tsx'
import './styles/global.scss'

const colorSchemeManager = localStorageColorSchemeManager({
  key: 'sc-vault-color-scheme',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="dark" colorSchemeManager={colorSchemeManager}>
      <App />
    </MantineProvider>
  </StrictMode>,
)
