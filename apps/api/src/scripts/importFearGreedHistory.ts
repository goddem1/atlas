import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { importFearGreedDailyBars } from "../services/fearGreedDailyBarImport.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiEnvPath = path.resolve(scriptDir, "../../.env");
const dockerEnvPath = path.resolve(scriptDir, "../../../../docker/.env");

dotenv.config({ path: apiEnvPath });
if (fs.existsSync(dockerEnvPath)) {
  dotenv.config({ path: dockerEnvPath, override: false });
}

function readArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (hit) return hit.slice(prefix.length).trim();
  return fallback;
}

const prisma = new PrismaClient();

try {
  const start = Number.parseInt(readArg("start", "1367193600"), 10);
  const end = Number.parseInt(readArg("end", "1788382800"), 10);
  const convertId = Number.parseInt(readArg("convertId", "2781"), 10);

  const result = await importFearGreedDailyBars(prisma, {
    start: Number.isFinite(start) ? start : 1367193600,
    end: Number.isFinite(end) ? end : 1788382800,
    convertId: Number.isFinite(convertId) ? convertId : 2781,
  });

  console.log("[fear-greed:import] done", result);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
