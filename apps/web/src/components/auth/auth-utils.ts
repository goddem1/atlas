export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Буква в аватаре дашборда: первая буква имени или, если имени нет, email. */
export function dashboardUserAvatarLetter(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const fromName = name?.trim();
  if (fromName) return fromName.charAt(0).toLocaleUpperCase();
  const fromEmail = email?.trim();
  if (fromEmail) return fromEmail.charAt(0).toLocaleUpperCase();
  return "?";
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Псевдослучайный цвет подложки аватара (стабильный для пользователя), alpha 0.3. */
export function dashboardUserAvatarBackground(
  userId: string | null | undefined,
  email: string | null | undefined,
): string {
  const seed = userId?.trim() || email?.trim() || "user";
  const hue = hashString(seed) % 360;
  return `hsla(${hue}, 68%, 52%, 0.3)`;
}

export function validatePassword(value: string): string | null {
  if (!value) return "Введите пароль";
  if (value.length < 8) return "Минимум 8 символов";
  return null;
}

export function validatePasswordMatch(password: string, confirm: string): string | null {
  const p = validatePassword(password);
  if (p) return p;
  if (password !== confirm) return "Пароли не совпадают";
  return null;
}

export function authErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "Произошла ошибка. Попробуйте снова.";
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/** Сообщение при ошибке signIn.social (в т.ч. PROVIDER_NOT_FOUND, если нет ключей Google). */
export function socialSignInError(err: unknown): string {
  const code = errorCode(err);
  const message = authErrorMessage(err);
  if (code === "PROVIDER_NOT_FOUND" || /provider not found/i.test(message)) {
    return "Вход через Google не настроен на сервере. Добавьте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в apps/api/.env и перезапустите API. В Google Cloud укажите redirect URI: http://localhost:5173/api/auth/callback/google";
  }
  return message || "Не удалось войти через Google";
}
