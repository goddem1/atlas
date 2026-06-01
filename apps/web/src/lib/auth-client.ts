import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

/** Better Auth требует абсолютный URL; эндпоинты живут под `/auth` (см. registerAuthRoutes). */
function authBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? "/api";
  const path = raw.replace(/\/$/, "") || "/api";

  const withAuthSuffix = (base: string) => {
    const trimmed = base.replace(/\/$/, "");
    return trimmed.endsWith("/auth") ? trimmed : `${trimmed}/auth`;
  };

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return withAuthSuffix(path);
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
  return withAuthSuffix(`${origin}${path.startsWith("/") ? path : `/${path}`}`);
}

export const authClient = createAuthClient({
  baseURL: authBaseUrl(),
  plugins: [emailOTPClient()],
});
