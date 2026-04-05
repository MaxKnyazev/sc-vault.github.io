#!/usr/bin/env node
/**
 * Читает stdin (вывод wrangler deploy), печатает первый URL *.workers.dev.
 */
import { readFileSync } from 'node:fs'

const input = readFileSync(0, 'utf-8')
const m = input.match(/https:\/\/[a-zA-Z0-9_.-]+\.workers\.dev/)
if (!m) {
  console.error('parse-workers-dev-url: в выводе wrangler не найден URL *.workers.dev')
  process.exit(1)
}
process.stdout.write(m[0])
