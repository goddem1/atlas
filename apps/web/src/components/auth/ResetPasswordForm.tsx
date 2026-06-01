import { useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";
import { AuthGhostField } from "./AuthGhostField";
import { isValidEmail, validatePasswordMatch } from "./auth-utils";

type Step = 1 | 2;

type Props = {
  onBackToSignIn: (message?: string) => void;
};

const RESEND_SEC = 60;

export function ResetPasswordForm({ onBackToSignIn }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    if (!isValidEmail(email)) {
      setErrors({ email: "Некорректный email" });
      return;
    }
    setLoading(true);
    setErrors({});
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: "forget-password",
    });
    setLoading(false);
    if (error) {
      setErrors({ form: error.message ?? "Не удалось отправить код" });
      return;
    }
    setCodeSent(true);
    setResendIn(RESEND_SEC);
  };

  const handleResetFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void (codeSent ? confirmOtp(e) : sendCode());
  };

  const confirmOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length < 6) {
      setErrors({ otp: "Введите 6-значный код" });
      return;
    }
    setLoading(true);
    setErrors({});
    const { error } = await authClient.emailOtp.checkVerificationOtp({
      email: email.trim(),
      type: "forget-password",
      otp: otp.trim(),
    });
    setLoading(false);
    if (error) {
      setErrors({ form: error.message ?? "Неверный код" });
      return;
    }
    setStep(2);
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const pw = validatePasswordMatch(password, confirm);
    if (pw) {
      setErrors({ password: pw });
      return;
    }
    setLoading(true);
    setErrors({});
    const { error } = await authClient.emailOtp.resetPassword({
      email: email.trim(),
      otp: otp.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      setErrors({ form: error.message ?? "Не удалось сменить пароль" });
      return;
    }
    onBackToSignIn("Пароль успешно изменён");
  };

  if (step === 2) {
    return (
      <form onSubmit={(e) => void savePassword(e)}>
        <AuthGhostField
          label="Новый пароль"
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
          {loading ? "Сохранение…" : "Сохранить"}
        </button>
      </form>
    );
  }

  return (
    <>
      <form onSubmit={handleResetFormSubmit}>
        <AuthGhostField
          label="Email"
          type="email"
          value={email}
          error={errors.email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={codeSent}
        />
        {codeSent ? (
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
                  onClick={() => void sendCode()}
                >
                  {resendIn > 0 ? `${resendIn} с` : "Повторно"}
                </button>
              </div>
            </label>
            {errors.otp ? <p className="auth-field-error">{errors.otp}</p> : null}
          </>
        ) : null}
        {errors.form ? <p className="auth-field-error">{errors.form}</p> : null}
        <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
          {loading ? "…" : codeSent ? "Подтвердить" : "Отправить код"}
        </button>
      </form>
      <button type="button" className="auth-link" onClick={() => onBackToSignIn()}>
        Вернуться к входу
      </button>
    </>
  );
}
