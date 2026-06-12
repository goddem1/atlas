import { useEffect, useRef, useState } from "react";
import { AuthPanoLogo } from "./AuthPanoLogo";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";
import { ResetPasswordForm } from "./ResetPasswordForm";
import "../widgets/shared/asset-picker.css";
import "../widgets/portfolio/portfolio-widget.css";
import "./auth-modal.css";

export type AuthScreen = "signin" | "signup" | "reset";

type Props = {
  open: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
};

export function AuthModal({ open, onClose, onAuthenticated }: Props) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<AuthScreen>("signin");
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setScreen("signin");
      setBanner(null);
    }
  }, [open]);

  if (!open) return null;

  const titles: Record<AuthScreen, { title: string; subtitle: string }> = {
    signin: { title: "Добро пожаловать", subtitle: "Авторизуйтесь через" },
    signup: { title: "Регистрация", subtitle: "Создайте аккаунт Panorama" },
    reset: { title: "Восстановление пароля", subtitle: "Мы отправим код на ваш email" },
  };

  const meta = titles[screen];

  return (
    <div className="asset-picker-overlay auth-modal-overlay" role="presentation">
      <button type="button" className="asset-picker-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        ref={modalRef}
        className="auth-modal-wrap"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="auth-close" aria-label="Закрыть" onClick={onClose}>
          <img src="/assets/portfolio-ui/close.svg" alt="" className="auth-close-icon" aria-hidden />
        </button>
        <AuthPanoLogo watchRootRef={modalRef} />
        <div className="auth-modal atlas-glass">
          <h2 id="auth-modal-title" className="auth-modal-title">
            {meta.title}
          </h2>
          <p className="auth-modal-subtitle">{meta.subtitle}</p>
          {banner ? <div className="auth-banner-success">{banner}</div> : null}

          {screen === "signin" ? (
            <SignInForm
              onSuccess={() => {
                onAuthenticated();
                onClose();
              }}
              onForgotPassword={() => {
                setBanner(null);
                setScreen("reset");
              }}
              onSignUp={() => {
                setBanner(null);
                setScreen("signup");
              }}
            />
          ) : null}

          {screen === "signup" ? (
            <SignUpForm
              onSuccess={() => {
                onAuthenticated();
                onClose();
              }}
              onSignIn={() => setScreen("signin")}
            />
          ) : null}

          {screen === "reset" ? (
            <ResetPasswordForm
              onBackToSignIn={(message) => {
                setScreen("signin");
                setBanner(message ?? null);
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
