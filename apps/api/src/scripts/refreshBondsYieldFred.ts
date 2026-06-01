import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { refreshBondsYieldFromFred } from "../services/bondsYieldFredRefresh.js";

const prisma = new PrismaClient();
const logger = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
  error: (msg: string) => console.error(msg),
};

refreshBondsYieldFromFred(prisma, logger)
  .then((r) => {
    console.log("[bonds-fred] result", r);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
