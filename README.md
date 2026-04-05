# SC Vault

Сайт на `React + TypeScript + Vite` с автодеплоем на GitHub Pages.

## 1) Локальный запуск

```bash
npm ci
npm run dev
```

## 2) Подготовка репозитория на GitHub

1. Создай репозиторий на GitHub (если еще не создан).
2. Привяжи локальный проект к удаленному репозиторию:

```bash
git remote add origin https://github.com/<YOUR_USERNAME>/sc-vault.github.io.git
```

3. Сделай первый коммит и отправь в `main`:

```bash
git add .
git commit -m "Initial project setup"
git push -u origin main
```

## 3) Включение GitHub Pages

1. Открой репозиторий на GitHub.
2. Перейди в `Settings` -> `Pages`.
3. В `Source` выбери `GitHub Actions`.

После этого каждый пуш в `main` будет автоматически деплоить сайт.

## 4) Что уже настроено в проекте

- `/.github/workflows/deploy-pages.yml` - workflow сборки и деплоя.
- `npm run build` собирает приложение в `dist`.
- После сборки запускается `postbuild` и создает `dist/404.html` для корректной работы SPA-роутов на GitHub Pages.

## 5) Проверка деплоя

1. Открой вкладку `Actions` в репозитории и дождись успешного workflow `Deploy to GitHub Pages`.
2. Адрес сайта будет:
   - для user/org pages: `https://<YOUR_USERNAME>.github.io/`
   - для project pages: `https://<YOUR_USERNAME>.github.io/<REPO_NAME>/`

## 6) Аукцион API на GitHub Pages (CORS)

Запросы с `*.github.io` к `eapi.stalcraft.net` в браузере блокируются CORS. В `npm run dev` это обходит прокси в `vite.config.ts` (`/stalcraft-eapi`).

Для **продакшена** в репозитории есть Cloudflare Worker в [`infra/stalcraft-cors-proxy`](./infra/stalcraft-cors-proxy/README.md). Workflow **сам** деплоит воркер и подставляет URL в сборку, если в GitHub добавлен секрет **`CLOUDFLARE_API_TOKEN`**. Подробные шаги и опции — в README прокси; вручную настраивать `VITE_STALCRAFT_API_BASE_URL` нужно только если не используете автодеплой воркера.

## 7) Важно про Vite `base`

Сейчас в `vite.config.ts` используется стандартный `base: "/"` (подходит для user/org pages, когда репозиторий вида `<username>.github.io`).

Если ты деплоишь в обычный project-репозиторий (не `<username>.github.io`), добавь в `vite.config.ts`:

```ts
export default defineConfig({
  base: '/<REPO_NAME>/',
  plugins: [react()],
})
```
