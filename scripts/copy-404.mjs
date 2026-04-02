import { copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const distDir = path.resolve(__dirname, '../dist')
const indexHtmlPath = path.join(distDir, 'index.html')
const notFoundHtmlPath = path.join(distDir, '404.html')

try {
  await copyFile(indexHtmlPath, notFoundHtmlPath)
  console.log('Copied dist/index.html to dist/404.html for GitHub Pages SPA fallback.')
} catch (error) {
  console.error('Failed to create dist/404.html:', error)
  process.exitCode = 1
}
