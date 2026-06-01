import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { PrismaClient } from "@prisma/client";
import { otpEmailHtml, sendAuthEmail } from "./lib/resendMail.js";

const prisma = new PrismaClient();

function trustedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN ?? process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "";
  if (!raw || raw === "true") {
    return ["http://localhost:5173", "http://127.0.0.1:5173"];
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

const baseURL =
  process.env.BETTER_AUTH_URL ??
  `http://localhost:${process.env.PORT ?? 3001}`;

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins: trustedOrigins(),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {},
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      void sendAuthEmail({
        to: user.email,
        subject: "Подтвердите email — Atlas",
        html: `<p>Здравствуйте, ${user.name ?? ""}!</p><p><a href="${url}">Подтвердить email</a></p>`,
      }).catch((err) => console.error("[auth] verification email:", err));
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 300,
      async sendVerificationOTP({ email, otp, type }) {
        const subjects: Record<string, { subject: string; title: string; hint: string }> = {
          "sign-in": {
            subject: "Код входа — Panorama",
            title: "Вход в Panorama",
            hint: "Введите код для входа:",
          },
          "email-verification": {
            subject: "Подтверждение email — Panorama",
            title: "Подтверждение email",
            hint: "Введите код:",
          },
          "forget-password": {
            subject: "Сброс пароля — Panorama",
            title: "Сброс пароля",
            hint: "Введите код для сброса пароля:",
          },
        };
        const meta = subjects[type] ?? subjects["sign-in"]!;
        if (!process.env.RESEND_API_KEY?.trim()) {
          if (process.env.NODE_ENV === "production") {
            throw new Error(
              "Отправка писем не настроена. Задайте RESEND_API_KEY и RESEND_FROM.",
            );
          }
          console.info(`[auth] DEV OTP (${type}) for ${email}: ${otp}`);
          return;
        }
        await sendAuthEmail({
          to: email,
          subject: meta.subject,
          html: otpEmailHtml(otp, meta.title, meta.hint),
        });
      },
    }),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
