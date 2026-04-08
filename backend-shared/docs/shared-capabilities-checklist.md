# Shared capabilities checklist (Host-0)

Проверка перед запуском backend на shared:

- [ ] PHP 8.1+ выбран как версия сайта/API
- [ ] Включены расширения `pdo_mysql`, `json`, `openssl`
- [ ] Доступен cron в ISPmanager
- [ ] HTTPS включен для домена/поддомена API
- [ ] Установлены лимиты:
  - [ ] `max_execution_time` не меньше 60 для cron/длинных запросов
  - [ ] `memory_limit` не меньше 256M
- [ ] Создан отдельный MySQL пользователь + БД для API
- [ ] Выполнена миграция `migrations/001_init.sql`
- [ ] В `config.php` заполнены DB/EXBO/CORS параметры

Рекомендуемая структура:

- frontend: `https://your-domain`
- api: `https://api.your-domain`
- CORS origin: `https://your-domain`

