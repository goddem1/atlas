import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import { AuthGhostField } from "./AuthGhostField";
import { isValidEmail, socialSignInError, validatePasswordMatch } from "./auth-utils";

type Props = {
  onSuccess: () => void;
  onSignIn: () => void;
};

export function SignUpForm({ onSuccess, onSignIn }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const googleSignIn = async () => {
    setLoading(true);
    setErrors({});
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.origin,
      });
      if (error) {
        setErrors({ form: socialSignInError(error) });
      }
    } catch (err) {
      setErrors({ form: socialSignInError(err) });
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Введите имя";
    if (!isValidEmail(email)) next.email = "Некорректный email";
    const pw = validatePasswordMatch(password, confirm);
    if (pw) next.password = pw;
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setLoading(true);
    setErrors({});
    const { error } = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      setErrors({ form: error.message ?? "Ошибка регистрации" });
      return;
    }
    onSuccess();
  };

  return (
    <>
      <form onSubmit={(e) => void submit(e)}>
        <AuthGhostField
          label="Имя"
          value={name}
          error={errors.name}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
        />
        <AuthGhostField
          label="Email"
          type="email"
          value={email}
          error={errors.email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthGhostField
          label="Пароль"
          type="password"
          value={password}
          error={errors.password}
          autoComplete="new-password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <AuthGhostField
          label="Повторите пароль"
          type="password"
          value={confirm}
          autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)}
        />
        {errors.form ? <p className="auth-field-error">{errors.form}</p> : null}
        <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
          {loading ? "Регистрация…" : "Зарегистрироваться"}
        </button>
      </form>

      <div className="auth-divider">или</div>

      <button type="button" className="auth-btn auth-btn-google" disabled={loading} onClick={() => void googleSignIn()}>
        <svg className="auth-btn-google-icon" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.122 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C33.64 6.053 28.991 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
          <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C33.64 6.053 28.991 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
          <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
          <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
        </svg>
      </button>

      <button type="button" className="auth-link" onClick={onSignIn}>
        Уже есть аккаунт? Войти
      </button>
    </>
  );
}
