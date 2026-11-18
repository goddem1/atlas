# Atlas

Монорепозиторий: **web** (Vite + React), **api** (Fastify + Prisma), **shared** (типы).

## Требования

- Node.js **≥ 20**
- [pnpm](https://pnpm.io/) **9** (см. `package.json` → `packageManager`)

## Быстрый старт

```bash
pnpm install
```

Скопируйте переменные окружения (см. корневой `.env.example`):

- `apps/api/.env` — API и Prisma (`DATABASE_URL`, JWT, `CORS_ORIGIN` и т.д.)
- `apps/web/.env` — опционально; в dev фронт ходит на API через прокси Vite (`/api`)

Поднимите PostgreSQL (или используйте `docker compose up -d` из корня):

```bash
pnpm db:push    # схема Prisma → БД
pnpm db:seed    # справочник криптовалют
```

Разовая загрузка дневных свечей (из каталога `apps/api`, нужен `DATABASE_URL`):

```bash
cd apps/api && pnpm load:candles
# Для ETH: SYMBOL=ETHUSDT START_MS=1514764800000 pnpm load:candles
```

Запуск в режиме разработки (API + web параллельно):

```bash
pnpm dev
```

- Web: обычно `http://localhost:5173`
- API: порт из `apps/api/.env` (по умолчанию `3001`)

## Сборка

```bash
pnpm build
```

## Полезные команды

| Команда        | Описание              |
|----------------|-----------------------|
| `pnpm lint`    | проверки TypeScript   |
| `pnpm db:studio` | Prisma Studio       |

## Docker (продакшен)

Стек: **PostgreSQL** + **API** (образ из `docker/Dockerfile.api`) + **nginx** со статикой фронта и прокси **`/api/*` → API** (`docker/Dockerfile.web`, конфиг `docker/nginx/web.conf`). Сборка фронта с `VITE_API_URL=/api`, запросы идут на тот же хост.

1. Создайте файл окружения (не коммитьте):

   ```bash
   cp docker/.env.prod.example docker/.env
   # отредактируйте POSTGRES_PASSWORD, JWT_*
   ```

2. Сборка и запуск:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file docker/.env up -d --build
   ```

3. Первая инициализация БД (один раз):

   ```bash
   docker compose -f docker-compose.prod.yml --env-file docker/.env exec api npx prisma db push
   docker compose -f docker-compose.prod.yml --env-file docker/.env exec api npx prisma db seed
   ```

4. Исторические свечи (по желанию; в образе уже собран `dist`):

   ```bash
   docker compose -f docker-compose.prod.yml --env-file docker/.env exec api node dist/scripts/loadCryptoCandles.js
   # Пример для ETH: добавьте -e SYMBOL=ETHUSDT -e START_MS=1514764800000 к docker compose exec
   ```

Сайт: `http://localhost:${HTTP_PORT:-8080}` (в проде перед контейнером обычно ставят HTTPS reverse proxy).

Локальная разработка по-прежнему: `docker compose up -d` (только `db` + Adminer из корневого `docker-compose.yml`).

## PRVTNEWS

Закрытый сбор Telegram-каналов. Отдельная база, не смешивается с Panorama. Прод: `https://scrtnews.panoramaapp.ru` (`docker compose -p prvtnews -f docker-compose.prvtnews.prod.yml --env-file docker/news.env up -d --build`).

```bash
docker compose -f docker-compose.prvtnews.yml up -d
copy apps\news-api\.env.example apps\news-api\.env
copy packages\news-schema\.env.example packages\news-schema\.env
pnpm --filter @atlas-v1/news-schema generate
pnpm news:db:push
pnpm news:api
pnpm news:web
pnpm news:ingest
```

Интерфейс: `http://localhost:5174`. Логин и пароль задаются в `apps/news-api/.env` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `NEWS_JWT_SECRET` от 32 символов). Сбор читает `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` и `TELEGRAM_SESSION` из `apps/api/.env` Panorama и не копирует их. Прокси — `TELEGRAM_PROXY_HOST` / `TELEGRAM_PROXY_PORT` или SOCKS на порту 1080 у того же хоста, что `RAPIDAPI_PROXY_URL`.

Каналы добавляются и удаляются в интерфейсе. Новый канал получает историю за 30 дней, затем живые сообщения, правки и удаления. Повторный запуск не создаёт дубли: уникальность `channelId + tgMsgId`. Схема Prisma: `packages/news-schema/prisma/schema.prisma`.

Разбор и сервисное окно: `pnpm news:extract`. Команда заполняет справочник монет, промпт версии 1 и пороги, разбирает версии без разбора и пересчитывает метрики. Ключ LLM берётся из `apps/api/.env`. Страницы: `http://localhost:5174/service` и `http://localhost:5174/service/labels`. Пока разметок меньше 100 или precision сигналов не в статусе ok, тестер и веса каналов показаны выключенными. После разбора `pnpm news:extract` связывает сигналы и взгляды в вызовы и кладёт неоднозначные связи в очередь на странице `http://localhost:5174/service/signals`. `pnpm news:prices` качает свечи Binance и пишет снимки цены. `pnpm news:profiles` собирает профиль закрытой недели по уже готовым разборам и отбрасывает утверждения без id сообщения этого канала. `pnpm news:sentiment` считает сентимент по сохранённым разборам: веса каналов равные, реклама не входит, страница `http://localhost:5174/service/sentiment`. Промпты и параметры: `http://localhost:5174/service/prompts` и `http://localhost:5174/service/params`. Новая версия промпта не включается сама. `pnpm news:digest` собирает день последних постов: что взяли в работу, где каналы согласны и где спорят, и проверяет, что выдача для Panorama не содержит имён каналов. Страница: `http://localhost:5174/service/digest`. Оценки тестера и рейтинг каналов не создаются, пока не пройдены ворота разбора. Итоги каналов: `http://localhost:5174/service/channels`.

## Git

Удалённый репозиторий: `https://github.com/goddem1/atlas.git`
