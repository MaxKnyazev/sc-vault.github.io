/**
 * Прокси GET → https://eapi.stalcraft.net с заголовками CORS для браузера.
 * Развёртывается отдельно (Cloudflare Workers), URL задаётся в VITE_STALCRAFT_API_BASE_URL.
 */
export interface Env {
  /** Если задано, только этот Origin получит ответ (иначе *). Должен совпадать с Origin в браузере. */
  ALLOWED_ORIGIN?: string
}

const UPSTREAM = 'https://eapi.stalcraft.net'

/** Копируем заголовки авторизации с каноничными именами (некоторые апстримы чувствительны к регистру). */
function copyForwardHeaders(from: Request, to: Headers): void {
  const auth = from.headers.get('Authorization') ?? from.headers.get('authorization')
  const cid = from.headers.get('Client-Id') ?? from.headers.get('client-id')
  const cs = from.headers.get('Client-Secret') ?? from.headers.get('client-secret')
  if (auth) to.set('Authorization', auth)
  if (cid) to.set('Client-Id', cid)
  if (cs) to.set('Client-Secret', cs)
  const accept = from.headers.get('Accept') ?? from.headers.get('accept')
  if (accept) to.set('Accept', accept)
  const al = from.headers.get('Accept-Language') ?? from.headers.get('accept-language')
  if (al) to.set('Accept-Language', al)
  if (!to.has('accept')) {
    to.set('Accept', 'application/json')
  }
}

function buildCorsHeaders(request: Request, env: Env): Record<string, string> | null {
  const origin = request.headers.get('Origin')
  const configured = env.ALLOWED_ORIGIN?.trim()
  if (configured) {
    if (origin !== configured) {
      return null
    }
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Client-Id, Client-Secret, Accept, Content-Type',
      'Access-Control-Max-Age': '86400',
    }
  }
  return {
    'Access-Control-Allow-Origin': '*',
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
      if (!cors) {
        return new Response('CORS: укажите в GitHub Variables STALCRAFT_CORS_ORIGIN точный Origin сайта (например https://username.github.io).', {
          status: 403,
        })
      }
      return new Response(null, { status: 204, headers: cors })
    }

    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: cors ?? { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    if (!cors) {
      return new Response(
        JSON.stringify({
          title: 'CORS denied',
          detail:
            'Origin не совпадает с ALLOWED_ORIGIN в воркере. Проверьте переменную STALCRAFT_CORS_ORIGIN в GitHub (точный URL без слэша в конце, как у сайта на GitHub Pages).',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
      )
    }

    const url = new URL(request.url)
    const target = `${UPSTREAM}${url.pathname}${url.search}`

    const fwd = new Headers()
    copyForwardHeaders(request, fwd)

    const resp = await fetch(target, { method: 'GET', headers: fwd })
    const out = new Headers(resp.headers)
    stripUpstreamCors(out)
    for (const [k, v] of Object.entries(cors)) {
      out.set(k, v)
    }

    return new Response(resp.body, { status: resp.status, headers: out })
  },
}
