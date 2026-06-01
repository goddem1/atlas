import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const fromAddress = process.env.RESEND_FROM ?? "Atlas <onboarding@resend.dev>";

export function isAuthEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendAuthEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!resend) {
    const msg =
      "Отправка писем не настроена. Добавьте RESEND_API_KEY в apps/api/.env (см. resend.com).";
    console.error("[resend]", msg, params.subject, "→", params.to);
    throw new Error(msg);
  }
  const { error } = await resend.emails.send({
    from: fromAddress,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  if (error) {
    console.error("[resend] send failed:", error);
    const msg = error.message ?? "Не удалось отправить письмо";
    const statusCode = "statusCode" in error ? (error as { statusCode?: number }).statusCode : undefined;
    if (statusCode === 403 && /only send testing emails to your own email/i.test(msg)) {
      throw new Error(
        "Resend в тестовом режиме (onboarding@resend.dev): код можно отправить только на email владельца аккаунта Resend. Для любых адресов добавьте домен на resend.com/domains и укажите RESEND_FROM с этого домена.",
      );
    }
    throw new Error(msg);
  }
}

export function otpEmailHtml(otp: string, title: string, hint: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px;">
      <h2 style="color:#6366f1;margin:0 0 12px;">${title}</h2>
      <p style="color:#94a3b8;margin:0 0 20px;">${hint}</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#e2e8f0;margin:0;">${otp}</p>
      <p style="color:#64748b;font-size:13px;margin-top:24px;">Код действует 5 минут.</p>
    </div>
  `;
}
