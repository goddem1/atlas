import { useCallback, useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";
import { AuthGhostField } from "./AuthGhostField";
import { isValidEmail, socialSignInError, validatePassword } from "./auth-utils";

type Tab = "password" | "otp";

type Props = {
  onSuccess: () => void;
  onForgotPassword: () => void;
  onSignUp: () => void;
};

const RESEND_SEC = 60;

export function SignInForm({ onSuccess, onForgotPassword, onSignUp }: Props) {
  const [tab, setTab] = useState<Tab>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const googleSignIn = useCallback(async () => {
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
  }, []);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!isValidEmail(email)) next.email = "Некорректный email";
    const pw = validatePassword(password);
    if (pw) next.password = pw;
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setLoading(true);
    setErrors({});
    const { error } = await authClient.signIn.email({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setErrors({ form: error.message ?? "Ошибка входа" });
      return;
    }
    onSuccess();
  };

  const sendOtp = async () => {
    if (!isValidEmail(email)) {
      setErrors({ email: "Некорректный email" });
      return;
    }
    setLoading(true);
    setErrors({});
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: "sign-in",
    });
    setLoading(false);
    if (error) {
      setErrors({ form: error.message ?? "Не удалось отправить код" });
      return;
    }
    setOtpSent(true);
    setResendIn(RESEND_SEC);
  };

  const handleOtpFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void (otpSent ? submitOtp(e) : sendOtp());
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length < 6) {
      setErrors({ otp: "Введите 6-значный код" });
      return;
    }
    setLoading(true);
    setErrors({});
    const { error } = await authClient.signIn.emailOtp({
      email: email.trim(),
      otp: otp.trim(),
    });
    setLoading(false);
    if (error) {
      setErrors({ form: error.message ?? "Неверный код" });
      return;
    }
    onSuccess();
  };

  return (
    <>
      {errors.form ? <p className="auth-field-error auth-form-error-top">{errors.form}</p> : null}

      <button type="button" className="auth-btn auth-btn-google" disabled={loading} onClick={() => void googleSignIn()}>
        <svg className="auth-btn-google-icon" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.122 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C33.64 6.053 28.991 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
          <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C33.64 6.053 28.991 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
          <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
          <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
        </svg>
      </button>

      <div className="auth-divider">Или</div>

      <div className="portfolio-buy-sell-toggle auth-mode-toggle">
        <button
          type="button"
          className={`portfolio-buy-sell-btn${tab === "password" ? " active" : ""}`}
          onClick={() => setTab("password")}
        >
          По паролю
        </button>
        <button
          type="button"
          className={`portfolio-buy-sell-btn${tab === "otp" ? " active" : ""}`}
          onClick={() => setTab("otp")}
        >
          По коду
        </button>
      </div>

      {tab === "password" ? (
        <form onSubmit={(e) => void submitPassword(e)}>
          <AuthGhostField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            error={errors.email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <AuthGhostField
            className="auth-password-field"
            label="Пароль"
            type="password"
            autoComplete="current-password"
            value={password}
            error={errors.password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" className="auth-link auth-link-forgot" onClick={onForgotPassword}>
            Забыли пароль?
          </button>
          <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleOtpFormSubmit}>
          <AuthGhostField
            label="Email"
            type="email"
            value={email}
            error={errors.email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={otpSent && loading}
          />
          {otpSent ? (
            <>
              <label
                className={`portfolio-field portfolio-ghost-field auth-ghost-field auth-otp-field${otp ? " is-floated" : ""}`}
              >
                <span className="portfolio-ghost-label">Код из письма</span>
                <div className="auth-otp-row">
                  <input
                    className={`portfolio-input-ghost${errors.otp ? " auth-input-error" : ""}`}
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    placeholder=" "
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <button
                    type="button"
                    className="auth-resend"
                    disabled={resendIn > 0 || loading}
                    onClick={() => void sendOtp()}
                  >
                    {resendIn > 0 ? `${resendIn} с` : "Повторно"}
                  </button>
                </div>
              </label>
              {errors.otp ? <p className="auth-field-error">{errors.otp}</p> : null}
            </>
          ) : null}
          <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
            {loading ? "…" : otpSent ? "Войти" : "Отправить код"}
          </button>
        </form>
      )}

      <p className="auth-footer-text">
        Если вы тут впервые? Скорее{" "}
        <button type="button" className="auth-link" onClick={onSignUp}>
          регистрируйтесь
        </button>
        !
      </p>
    </>
  );
}
