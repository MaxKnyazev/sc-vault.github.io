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
})
