import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env" });
const prisma = new PrismaClient();

const watched = await prisma.telegramWatchedChannel.findMany({
  select: { username: true, title: true, lastSyncAt: true },
});

const days = await prisma.$queryRawUnsafe<Array<{ day_msk: string; cnt: number }>>(
  `SELECT (date AT TIME ZONE 'Europe/Moscow')::date::text AS day_msk, COUNT(*)::int AS cnt
   FROM "TelegramNewsPost"
   GROUP BY 1
   ORDER BY 1 DESC
   LIMIT 10`,
);

const yesterday = await prisma.$queryRawUnsafe<
  Array<{ total: number; with_text: number; media_only: number }>
>(
  `SELECT
     COUNT(*)::int AS total,
     COUNT(*) FILTER (WHERE length(trim(coalesce(text,''))) > 0)::int AS with_text,
     COUNT(*) FILTER (WHERE length(trim(coalesce(text,''))) = 0 AND "hasMedia")::int AS media_only
   FROM "TelegramNewsPost"
   WHERE (date AT TIME ZONE 'Europe/Moscow')::date = ((now() AT TIME ZONE 'Europe/Moscow')::date - 1)`,
);

const byCh = await prisma.$queryRawUnsafe<Array<{ channelUsername: string; cnt: number }>>(
  `SELECT "channelUsername", COUNT(*)::int AS cnt
   FROM "TelegramNewsPost"
   WHERE (date AT TIME ZONE 'Europe/Moscow')::date = ((now() AT TIME ZONE 'Europe/Moscow')::date - 1)
   GROUP BY 1
   ORDER BY cnt DESC`,
);

console.log(
  JSON.stringify(
    {
      watched,
      last10Days: days,
      yesterday: yesterday[0],
      yesterdayByChannel: byCh,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
