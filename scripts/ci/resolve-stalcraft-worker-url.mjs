#!/usr/bin/env node
/**
 * Определяет публичный URL *.workers.dev после wrangler deploy:
 * 1) парсинг stdout/stderr (с удалением ANSI);
 * 2) при неудаче — Cloudflare API GET .../workers/subdomain + имя из wrangler.toml.
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../..')
const WRANGLER_TOML = join(REPO_ROOT, 'infra/stalcraft-cors-proxy/wrangler.toml')
const INFRA_DIR = join(REPO_ROOT, 'infra/stalcraft-cors-proxy')

function stripAnsi(s) {
  return s.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
}

function parseUrlFromDeployLog(text) {
  const clean = stripAnsi(text)
  const m = clean.match(/https:\/\/[^\s)\]'"<>]+\.workers\.dev\b/)
  return m ? m[0].replace(/\/$/, '') : null
}

function readWranglerTomlFields() {
  const raw = readFileSync(WRANGLER_TOML, 'utf-8')
  const nameM = raw.match(/name\s*=\s*"([^"]+)"/)
  if (!nameM) throw new Error('Не найден name в infra/stalcraft-cors-proxy/wrangler.toml')
  const accountM = raw.match(/account_id\s*=\s*"([^"]+)"/)
  return {
    workerName: nameM[1],
    accountIdFromToml: accountM?.[1]?.trim() ?? null,
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

async function getUrlFromCloudflareApi(accountId, workerName) {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const json = await res.json()
  if (!json.success) {
    throw new Error(`API workers/subdomain HTTP ${res.status}: ${JSON.stringify(json.errors ?? json)}`)
  }
  const sub = json.result?.subdomain ?? json.result
  if (typeof sub !== 'string' || !sub) {
    throw new Error(`API workers/subdomain: неожиданный result: ${JSON.stringify(json.result)}`)
  }
  return `https://${workerName}.${sub}.workers.dev`
}

const deployOutput = readFileSync(0, 'utf-8')

let url = parseUrlFromDeployLog(deployOutput)
if (url) {
  process.stdout.write(url)
  process.exit(0)
}

const { workerName, accountIdFromToml } = readWranglerTomlFields()
let accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || accountIdFromToml || undefined
if (!accountId) {
  accountId = getAccountIdFromWhoami()
}

try {
  url = await getUrlFromCloudflareApi(accountId, workerName)
} catch (e) {
  console.error('resolve-stalcraft-worker-url: не удалось извлечь URL из лога deploy и через API.')
  console.error(String(e?.message ?? e))
  console.error('--- вывод wrangler (фрагмент) ---')
  console.error(deployOutput.slice(-4000))
  process.exit(1)
}

process.stdout.write(url)
