/**
 * Прокси GET → https://eapi.stalcraft.net с заголовками CORS для браузера.
 * Развёртывается отдельно (Cloudflare Workers), URL задаётся в VITE_STALCRAFT_API_BASE_URL.
 */
export interface Env {
  /** Если задано, только этот Origin получит Access-Control-Allow-Origin (иначе *). */
  ALLOWED_ORIGIN?: string
}

const UPSTREAM = 'https://eapi.stalcraft.net'
const FORWARD_HEADERS = [
  'authorization',
  'client-id',
  'client-secret',
  'accept',
  'accept-language',
] as const

function buildCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin')
  const configured = env.ALLOWED_ORIGIN?.trim()
  let allowOrigin = '*'
  if (configured) {
    allowOrigin = origin === configured ? origin : 'null'
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Client-Id, Client-Secret, Accept, Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function stripUpstreamCors(headers: Headers): void {
  for (const key of [...headers.keys()]) {
    if (key.toLowerCase().startsWith('access-control-')) {
      headers.delete(key)
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = buildCorsHeaders(request, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: cors })
    }

    const url = new URL(request.url)
    const target = `${UPSTREAM}${url.pathname}${url.search}`

    const fwd = new Headers()
    for (const name of FORWARD_HEADERS) {
      const v = request.headers.get(name)
      if (v) fwd.set(name, v)
    }
    if (!fwd.has('accept')) {
      fwd.set('accept', 'application/json')
    }

    const resp = await fetch(target, { method: 'GET', headers: fwd })
    const out = new Headers(resp.headers)
    stripUpstreamCors(out)
    for (const [k, v] of Object.entries(cors)) {
      out.set(k, v)
    }

    return new Response(resp.body, { status: resp.status, headers: out })
  },
}
