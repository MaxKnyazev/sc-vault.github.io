# Прокси для Stalcraft eAPI (CORS)

Браузер с GitHub Pages не может вызывать `https://eapi.stalcraft.net` напрямую: у API нет CORS для вашего домена. В dev это обходит Vite (`/stalcraft-eapi`), на Pages нужен этот прокси.

## Автоматически из GitHub Actions (рекомендуется)

Остаётся только то, к которому нет доступа из кода:

1. **Cloudflare** — аккаунт на [dash.cloudflare.com](https://dash.cloudflare.com) (бесплатный тариф Workers достаточно).
2. **API Token**: [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → шаблон **Edit Cloudflare Workers** или вручную права: `Account` — Workers Scripts — Edit, `Account` — Account Settings — Read (при необходимости).
3. В репозитории GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - **`CLOUDFLARE_API_TOKEN`** — вставьте созданный токен.

Опционально:

- **`CLOUDFLARE_ACCOUNT_ID`** — если `wrangler` в CI ругается на аккаунт: [Workers overview](https://dash.cloudflare.com/) → справа внизу **Account ID**.
- **Variables → Actions → New repository variable** **`STALCRAFT_CORS_ORIGIN`** — например `https://ваш-логин.github.io` (без пути к репозиторию). Тогда воркер ограничит CORS этим Origin вместо `*`.

При каждом пуше в `main` workflow **сам** деплоит воркер и подставляет его URL в `VITE_STALCRAFT_API_BASE_URL` при сборке сайта. Отдельный секрет `VITE_STALCRAFT_API_BASE_URL` не нужен, если задан `CLOUDFLARE_API_TOKEN`.

**Первый запуск Cloudflare:** если аккаунт ещё не использовал Workers, один раз зарегистрируйте поддомен `*.workers.dev` (в Dashboard **Workers & Pages** или локально `cd infra/stalcraft-cors-proxy && npx wrangler login && npx wrangler deploy`), иначе неинтерактивный CI может завершиться ошибкой.

**Если workflow падает после `wrangler deploy`:** в логе ищите шаг «Deploy Cloudflare Worker». URL воркера берётся из вывода wrangler или через API `workers/subdomain`. Убедитесь, что у токена есть доступ к аккаунту; при нескольких аккаунтах задайте **`CLOUDFLARE_ACCOUNT_ID`** или раскомментируйте `account_id` в `wrangler.toml`.

**Ошибка «register a workers.dev subdomain» / интерактивный вопрос в CI:** перед `wrangler deploy` workflow вызывает `scripts/ci/ensure-workers-dev-subdomain.mjs` — при отсутствии поддомена у аккаунта он регистрируется через API `PUT .../workers/subdomain`. Имя по умолчанию — от slug владельца репоз (`github.repository_owner`). Если имя уже занято глобально, в **Repository variables** задайте **`CLOUDFLARE_WORKERS_SUBDOMAIN`** (латиница, цифры, дефис) и перезапустите workflow.

**Ошибка `Unexpected token '<'` / ответ не JSON:** в секрете **`CLOUDFLARE_ACCOUNT_ID`** должен быть только **32-символьный hex** Account ID (как в Dashboard справа внизу), без пробелов и лишнего текста. Неверный ID часто приводит к HTML-странице вместо JSON от API.

## Вручную (без CI)

```bash
cd infra/stalcraft-cors-proxy
npm ci
npx wrangler login
npm run deploy
```

Скопируйте URL вида `https://…workers.dev` и задайте секрет **`VITE_STALCRAFT_API_BASE_URL`** (без `/` в конце), если **не** используете `CLOUDFLARE_API_TOKEN` в Actions.

## Локальная разработка

Как раньше: dev-сервер Vite проксирует `/stalcraft-eapi` → `eapi`. При необходимости в `.env` можно задать `VITE_STALCRAFT_API_BASE_URL` на URL своего воркера.
