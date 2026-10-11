/**
 * QR-авторизация GramJS → пишет TELEGRAM_SESSION в apps/api/.env
 *
 *   cd apps/api && pnpm telegram:auth
 *
 * Откроется PNG с QR: apps/api/telegram-login-qr.png
 * Telegram → Настройки → Устройства → Подключить устройство → сканируй.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import QRCode from "qrcode";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { parseOutboundProxyUrl } from "../lib/httpProxy.js";
import type { TelegramSocksProxy } from "../lib/httpProxy.js";

const apiId = Number.parseInt(process.env.TELEGRAM_API_ID?.trim() ?? "", 10);
const apiHash = process.env.TELEGRAM_API_HASH?.trim() ?? "";
const twoFa = process.env.TELEGRAM_2FA_PASSWORD?.trim() ?? "";

if (!Number.isFinite(apiId) || apiId <= 0 || !apiHash) {
  console.error("Задайте TELEGRAM_API_ID и TELEGRAM_API_HASH в apps/api/.env");
  process.exit(1);
}

/** Только явный TELEGRAM_PROXY_* — без угадывания SOCKS из HTTP RapidAPI. */
function readAuthProxy(): TelegramSocksProxy | undefined {
  const explicitUrl = process.env.TELEGRAM_PROXY_URL?.trim();
  if (explicitUrl) {
    const parsed = parseOutboundProxyUrl(explicitUrl);
    if (parsed && (parsed.protocol === "socks4" || parsed.protocol === "socks5")) {
      return {
        ip: parsed.host,
        port: parsed.port,
        socksType: parsed.protocol === "socks4" ? 4 : 5,
        username: parsed.username,
        password: parsed.password,
      };
    }
  }
  const host = process.env.TELEGRAM_PROXY_HOST?.trim();
  const portRaw = process.env.TELEGRAM_PROXY_PORT?.trim();
  if (!host || !portRaw) return undefined;
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port)) return undefined;
  const type = (process.env.TELEGRAM_PROXY_TYPE ?? "socks5").toLowerCase();
  if (type !== "socks4" && type !== "socks5") return undefined;
  return {
    ip: host,
    port,
    socksType: type === "socks4" ? 4 : 5,
    username: process.env.TELEGRAM_PROXY_USERNAME?.trim() || undefined,
    password: process.env.TELEGRAM_PROXY_PASSWORD?.trim() || undefined,
  };
}

const proxy = readAuthProxy();
if (proxy) {
  console.log(`Прокси: socks${proxy.socksType}://${proxy.ip}:${proxy.port}`);
} else {
  console.log("Прокси не задан — прямое подключение к Telegram.");
}

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = path.join(apiDir, ".env");
const qrPngPath = path.join(apiDir, "telegram-login-qr.png");

function upsertEnvSession(session: string): void {
  let text = "";
  try {
    text = fs.readFileSync(envPath, "utf8");
  } catch {
    text = "";
  }
  const line = `TELEGRAM_SESSION=${session}`;
  if (/^TELEGRAM_SESSION=/m.test(text)) {
    text = text.replace(/^TELEGRAM_SESSION=.*$/m, line);
  } else {
    text = `${text.trimEnd()}\n\n${line}\n`;
  }
  fs.writeFileSync(envPath, text, "utf8");
}

function openFile(filePath: string): void {
  const cmd =
    process.platform === "win32"
      ? `start "" "${filePath}"`
      : process.platform === "darwin"
        ? `open "${filePath}"`
        : `xdg-open "${filePath}"`;
  exec(cmd, () => undefined);
}

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 5,
  ...(proxy ? { proxy } : {}),
});

console.log("Подключение к Telegram…");
await client.connect();

console.log("\nОтсканируй QR в Telegram:");
console.log("Настройки → Устройства → Подключить устройство");
console.log(`Файл с QR: ${qrPngPath}\n`);

await client.signInUserWithQrCode(
  { apiId, apiHash },
  {
    onError: async (err) => {
      console.error("Ошибка авторизации:", err.message);
      return false;
    },
    qrCode: async (code) => {
      const token = code.token.toString("base64url");
      const url = `tg://login?token=${token}`;
      await QRCode.toFile(qrPngPath, url, {
        type: "png",
        width: 512,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      console.log(`QR обновлён → ${qrPngPath}`);
      console.log(`(до ${new Date(code.expires * 1000).toLocaleTimeString("ru-RU")})\n`);
      openFile(qrPngPath);
    },
    password: async (hint) => {
      if (twoFa) return twoFa;
      console.error(
        `Нужен пароль 2FA${hint ? ` (подсказка: ${hint})` : ""}. Задайте TELEGRAM_2FA_PASSWORD в .env и запустите снова.`,
      );
      throw new Error("AUTH_USER_CANCEL");
    },
  },
);

const saved = String(client.session.save());
upsertEnvSession(saved);
console.log("\nАвторизация успешна. TELEGRAM_SESSION записан в apps/api/.env");
try {
  fs.unlinkSync(qrPngPath);
} catch {
  // ignore
}
await client.disconnect();
process.exit(0);
