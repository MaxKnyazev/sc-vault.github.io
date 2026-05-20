import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createTheme, MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import App from './App.tsx'
import './styles/global.scss'

try {
  localStorage.removeItem('sc-vault-color-scheme')
} catch {
  /* ignore */
}

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
    <MantineProvider theme={mantineTheme} forceColorScheme="dark">
      <App />
    </MantineProvider>
  </StrictMode>,
)
