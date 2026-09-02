import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetch as undiciFetch } from "undici";
import { getRapidApiDispatcher, readSharedOutboundProxyRaw } from "../lib/httpProxy.js";
import { BONDS_TV_RAPIDAPI_HOST } from "../services/bondsYieldConfig.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiEnvPath = path.resolve(scriptDir, "../../.env");
const dockerEnvPath = path.resolve(scriptDir, "../../../../docker/.env");

dotenv.config({ path: apiEnvPath });
if (fs.existsSync(dockerEnvPath)) {
  dotenv.config({ path: dockerEnvPath, override: false });
}

type TvPriceResponse = {
  success?: boolean;
  error?: string;
  data?: {
    current?: {
      open?: number;
      high?: number;
      low?: number;
      close?: number;
      time?: number;
    };
    history?: Array<{
      open?: number;
      high?: number;
      low?: number;
      close?: number;
      time?: number;
    }>;
  };
};

function readArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (hit) return hit.slice(prefix.length).trim();
  return fallback;
}

async function main(): Promise<void> {
  const symbol = readArg("symbol", process.env.TV_TEST_SYMBOL?.trim() || "CRYPTOCAP:BTC.D");
  const timeframe = readArg("timeframe", "D");
  const range = readArg("range", "1000");
  const to = readArg("to", "0");
  const apiKey = process.env.RAPIDAPI_KEY?.trim();
  const proxyRaw = readSharedOutboundProxyRaw();

  if (!apiKey) {
    throw new Error("RAPIDAPI_KEY is required in apps/api/.env");
  }
  if (!proxyRaw) {
    console.warn(
      "[tv:test-price] RAPIDAPI_PROXY_URL is not set — запрос пойдёт напрямую (в РФ часто 451). " +
        "Скопируйте RAPIDAPI_PROXY_URL из docker/.env на сервере.",
    );
  }

  const dispatcher = getRapidApiDispatcher();
  const url = new URL(`https://${BONDS_TV_RAPIDAPI_HOST}/api/price/${symbol}`);
  url.searchParams.set("timeframe", timeframe);
  url.searchParams.set("range", range);
  url.searchParams.set("to", to);

  console.log("[tv:test-price] request", {
    url: url.toString(),
    proxy: proxyRaw ? "enabled" : "disabled",
    host: BONDS_TV_RAPIDAPI_HOST,
  });

  const res = await undiciFetch(url.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(60_000),
    ...(dispatcher ? { dispatcher } : {}),
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": BONDS_TV_RAPIDAPI_HOST,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("[tv:test-price] HTTP error", res.status, text.slice(0, 500));
    process.exitCode = 1;
    return;
  }

  let body: TvPriceResponse;
  try {
    body = JSON.parse(text) as TvPriceResponse;
  } catch {
    console.log("[tv:test-price] raw response (non-JSON):");
    console.log(text);
    return;
  }

  const history = body.data?.history ?? [];
  const current = body.data?.current;

  console.log("[tv:test-price] summary", {
    success: body.success ?? null,
    error: body.error ?? null,
    current,
    historyCount: history.length,
    firstBar: history[0] ?? null,
    lastBar: history.length > 0 ? history[history.length - 1] : null,
  });

  console.log("[tv:test-price] full JSON:");
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
