import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { refreshMarketIndicesDaily } from "../services/marketIndicesDailyRefresh.js";

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env"),
});

const prisma = new PrismaClient();

try {
  const result = await refreshMarketIndicesDaily(prisma, {
    info: (obj, msg) => console.log(msg ?? "", obj),
    warn: (obj, msg) => console.warn(msg ?? "", obj),
  });
  console.log("Done:", result);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
