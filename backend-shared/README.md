# backend-shared (Host-0 / ISPmanager)

Минимальный backend-слой для shared-хостинга REG.RU:

- PHP API (`public/index.php`)
- MySQL
- cron-скрипт для обновления аукционных агрегатов за 12 часов

## 1. Требования

- PHP 8.1+
- MySQL 8+
- Включенный `cron`
- HTTPS для домена

## 2. Структура

- `public/index.php` — единая точка входа API
- `src/` — DB, auth, репозитории
- `config.php` — конфиг через env или значения по умолчанию
- `migrations/001_init.sql` + `migrations/002_users_profile_and_roles.sql` + `migrations/003_recipe_result_overrides.sql` — схема БД
- `cron/update_auction.php` — обновление `auction_stats`
- `cron/cleanup_tokens.php` — очистка просроченных auth токенов

## 3. Настройка

1. Создайте БД и пользователя MySQL.
2. Примените миграции по порядку:
   - `migrations/001_init.sql`
   - `migrations/002_users_profile_and_roles.sql`
   - `migrations/003_recipe_result_overrides.sql`
3. Скопируйте `config.example.php` в `config.php` и заполните:
   - DB параметры
   - `EXBO_CLIENT_ID`, `EXBO_CLIENT_SECRET`
   - `APP_ALLOWED_ORIGIN`
4. Разместите `backend-shared/public` как веб-каталог для `api.your-domain`.

## 4. Endpoints

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me` (Bearer token)
- `POST /auth/logout` (Bearer token)
- `GET /auction/stats?ids=id1,id2`
- `GET /recipe-overrides` (глобальные ручные override для крафтов)
- `POST /recipe-overrides/save` (admin only)
- `POST /recipe-overrides/bulk-save` (admin only, CSV/массовый импорт)
- `GET /user/buy-prices` (Bearer token)
- `POST /user/buy-prices` (Bearer token)

Auth contract:
- register/login принимают `nickname` + `password`.
- `GET /auth/me` возвращает профиль: `id`, `nickname`, `role`, `avatarUrl`.
- роли: `blocked | user | admin`.

## 5. Cron

Пример запуска каждые 30 минут:

```bash
*/30 * * * * /usr/bin/php /path/to/backend-shared/cron/update_auction.php >/dev/null 2>&1
```

Рекомендуемая очистка просроченных токенов раз в час:

```bash
0 * * * * /usr/bin/php /path/to/backend-shared/cron/cleanup_tokens.php >/dev/null 2>&1
```

Список item id для обновления:

- через env `AUCTION_ITEM_IDS` (CSV), либо
- файл `backend-shared/cron/item_ids.txt` (по одному id на строку)

Параметры ускорения cron (опционально через env):

- `AUCTION_MAX_PAGES_PER_ITEM` (default `20`)
- `AUCTION_SLEEP_BETWEEN_PAGES_MS` (default `0`)
- `AUCTION_SLEEP_BETWEEN_ITEMS_MS` (default `0`)
- `AUCTION_ITEM_LIMIT` (default `0`, значит без лимита)
- `AUCTION_PROGRESS_EVERY` (default `25`)

## 6. Безопасность

- CORS ограничен `APP_ALLOWED_ORIGIN`
- Токены хранятся в `auth_tokens` в виде SHA-256 hash
- Пароли хешируются `password_hash()`
- В `register/login` включен базовый rate-limit по IP

