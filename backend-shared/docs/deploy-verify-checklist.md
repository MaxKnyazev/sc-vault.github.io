# Deploy and smoke-test checklist

## Deploy

- [ ] Залит `backend-shared/` на хостинг
- [ ] `public/index.php` доступен на `https://api.<domain>`
- [ ] `config.php` заполнен корректно
- [ ] cron `update_auction.php` добавлен в расписание

## API checks

- [ ] `GET /health` -> 200
- [ ] `POST /auth/register` -> 201 + token
- [ ] `POST /auth/login` -> 200 + token
- [ ] `GET /auth/me` (Bearer) -> 200
- [ ] `GET /auction/stats?ids=<item1>,<item2>` -> 200 + items
- [ ] `POST /user/buy-prices` (Bearer) -> 200
- [ ] `GET /user/buy-prices` (Bearer) -> 200 + values

## Frontend checks

- [ ] `VITE_BACKEND_API_BASE_URL` указывает на API
- [ ] Обновление аукциона идёт через backend endpoint
- [ ] Цены скупа сохраняются в backend, а не только localStorage
- [ ] Фолбэк работает: при недоступном API UI не падает

## Operations

- [ ] Бэкап MySQL по cron (ежедневно)
- [ ] Лог cron ошибок сохраняется
- [ ] Проверены CORS и HTTPS

