import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const [repositoryOwner = '', repositoryName = ''] = (
  process.env.GITHUB_REPOSITORY ?? ''
).split('/')
const isUserOrOrgPagesRepo =
  repositoryOwner.length > 0 &&
  repositoryName.toLowerCase() === `${repositoryOwner.toLowerCase()}.github.io`
const pagesBasePath =
  process.env.GITHUB_ACTIONS === 'true'
    ? isUserOrOrgPagesRepo
      ? '/'
      : `/${repositoryName}/`
    : '/'

export default defineConfig({
  base: pagesBasePath,
  plugins: [react()],
  server: {
    proxy: {
      // Dev-only proxy to bypass browser CORS for eapi.stalcraft.net.
      '/stalcraft-eapi': {
        target: 'https://eapi.stalcraft.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/stalcraft-eapi/, ''),
      },
    },
  },
})
