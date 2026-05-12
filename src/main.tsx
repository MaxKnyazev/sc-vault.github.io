import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createTheme, localStorageColorSchemeManager, MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import App from './App.tsx'
import './styles/global.scss'

const colorSchemeManager = localStorageColorSchemeManager({
  key: 'sc-vault-color-scheme',
})

const mantineTheme = createTheme({
  components: {
    Modal: {
      defaultProps: {
        removeScrollProps: { removeScrollBar: false },
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider
      theme={mantineTheme}
      defaultColorScheme="dark"
      colorSchemeManager={colorSchemeManager}
    >
      <App />
    </MantineProvider>
  </StrictMode>,
)
