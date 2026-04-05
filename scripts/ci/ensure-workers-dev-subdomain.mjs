#!/usr/bin/env node
/**
 * В CI нельзя ответить на вопрос wrangler про регистрацию workers.dev.
 * Если у аккаунта ещё нет поддомена — регистрируем через API (один раз на аккаунт).
 * @see https://developers.cloudflare.com/api/resources/workers/subresources/subdomains/methods/update/
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../..')
const INFRA_DIR = join(REPO_ROOT, 'infra/stalcraft-cors-proxy')
const WRANGLER_TOML = join(INFRA_DIR, 'wrangler.toml')

function readAccountIdFromToml() {
  try {
    const raw = readFileSync(WRANGLER_TOML, 'utf-8')
    const m = raw.match(/account_id\s*=\s*"([^"]+)"/)
    return m?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

function getAccountIdFromWhoami() {
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN не задан')

  const r = spawnSync('npx', ['wrangler', 'whoami', '--json'], {
    cwd: INFRA_DIR,
    encoding: 'utf-8',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) {
    throw new Error(`wrangler whoami --json: ${r.stderr || r.stdout}`)
  }
  const data = JSON.parse(r.stdout)
  const id = data.accounts?.[0]?.id
  if (!id) throw new Error('wrangler whoami: нет accounts[0].id')
  return id
}

function slugifySubdomain(raw) {
  let s = String(raw || 'stalcraft')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!s.length) s = 'stalcraft-user'
  if (/^[0-9]/.test(s)) s = `x-${s}`
  return s.slice(0, 63)
}

/** @returns {Promise<string | null>} текущий поддомен или null, если ещё не регистрировали */
async function getSubdomain(accountId, token) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const json = await res.json()
  if (json.success && json.result && typeof json.result.subdomain === 'string' && json.result.subdomain.length > 0) {
    return json.result.subdomain
  }
  if (!json.success && json.errors?.length) {
    console.warn('GET workers/subdomain:', JSON.stringify(json.errors))
  }
  return null
}

async function putSubdomain(accountId, token, subdomain) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subdomain }),
    },
  )
  const json = await res.json()
  if (!json.success) {
    throw new Error(`PUT workers/subdomain: HTTP ${res.status} ${JSON.stringify(json.errors ?? json)}`)
  }
  console.log(`Зарегистрирован поддомен workers.dev: ${json.result?.subdomain ?? subdomain}`)
}

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token?.trim()) {
    console.log('ensure-workers-dev-subdomain: нет CLOUDFLARE_API_TOKEN, пропуск.')
    return
  }

  let accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || readAccountIdFromToml() || null
  if (!accountId) {
    accountId = getAccountIdFromWhoami()
  }

  const existing = await getSubdomain(accountId, token)
  if (existing) {
    console.log(`Поддомен workers.dev уже есть: ${existing}`)
    return
  }

  const preferred =
    process.env.CLOUDFLARE_WORKERS_SUBDOMAIN?.trim() ||
    slugifySubdomain(process.env.GITHUB_REPOSITORY_OWNER)

  console.log(`Регистрация поддомена workers.dev: ${preferred} …`)
  await putSubdomain(accountId, token, preferred)
}

main().catch((e) => {
  console.error(e)
  console.error(
    '\nЕсли имя занято или недопустимо: в GitHub → Variables задайте CLOUDFLARE_WORKERS_SUBDOMAIN (латиница, цифры, дефис).',
  )
  process.exit(1)
})
