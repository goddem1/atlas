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

## Git

Удалённый репозиторий: `https://github.com/goddem1/atlas.git`
