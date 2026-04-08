# SC Vault

Сайт на `React + TypeScript + Vite` с автодеплоем на REG.RU.

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

## 3) Что уже настроено

- `/.github/workflows/deploy-regru.yml` — автодеплой на REG.RU по push в `main`.
- `npm run build` собирает приложение в `dist`.
- В `vite.config.ts` используется `base: "/"` для корректной загрузки на основном домене.

> GitHub Pages workflow удален и больше не используется.

## 4) Backend для shared Host-0 (REG.RU)

В репозитории добавлен стартовый backend-слой для shared-хостинга:

- [`backend-shared/README.md`](./backend-shared/README.md)
- чеклист возможностей shared: [`backend-shared/docs/shared-capabilities-checklist.md`](./backend-shared/docs/shared-capabilities-checklist.md)
- чеклист деплоя/проверки: [`backend-shared/docs/deploy-verify-checklist.md`](./backend-shared/docs/deploy-verify-checklist.md)

Для переключения фронта на backend укажите:

```env
VITE_BACKEND_API_BASE_URL=https://api.your-domain.tld
```

## 5) Автодеплой на REG.RU из `main`

Добавлен workflow `/.github/workflows/deploy-regru.yml`.

Что делает:
- при пуше в `main` (или вручную через `workflow_dispatch`) собирает фронт (`dist`);
- деплоит `dist` в каталог сайта `sctool.ru` по SFTP;
- опционально деплоит backend из `backend-shared` в каталог `api.sctool.ru`.

Обязательные GitHub Secrets:
- `REGRU_SFTP_HOST` (например, `your-host.reg.ru`)
- `REGRU_SFTP_PORT` (обычно `22`)
- `REGRU_SFTP_USERNAME`
- `REGRU_SFTP_PASSWORD`

Обязательные GitHub Variables:
- `REGRU_FRONTEND_REMOTE_DIR` (например, `/www/sctool.ru`)
- `REGRU_BACKEND_REMOTE_DIR` (например, `/www/api.sctool.ru`)
- `REGRU_DEPLOY_BACKEND` (`true` или `false`)

Рекомендуемые GitHub Variables для фронта:
- `VITE_BACKEND_API_BASE_URL=https://api.sctool.ru`
- `VITE_STALCRAFT_API_BASE_URL` (если нужен прокси в проде)
- `VITE_STALCRAFT_AUCTION_REGION=ru`

Важно:
- деплой использует `mirror --delete`, поэтому удаляет на сервере файлы, которых нет в репозитории;
- для backend в репозитории должен быть актуальный `backend-shared/config.php` с прод-конфигурацией.
