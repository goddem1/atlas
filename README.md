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

## Git

Удалённый репозиторий: `https://github.com/goddem1/atlas.git`
