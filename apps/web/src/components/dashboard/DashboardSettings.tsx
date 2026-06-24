import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { dashboardUserAvatarBackground, dashboardUserAvatarLetter } from "../auth/auth-utils";
import type { DashboardPrefs, DashboardTheme } from "../../lib/dashboardPrefs";
import { clampGridOpacity } from "../../lib/dashboardPrefs";
import { profileAvatarUrl, type ProfileUserResponse } from "../../services/api";

const ProfileSettingsModal = lazy(() =>
  import("./ProfileSettingsModal").then((m) => ({ default: m.ProfileSettingsModal })),
);

type Props = {
  prefs: DashboardPrefs;
  onChange: (next: DashboardPrefs) => void;
  onOpenAuth: () => void;
  isLoggedIn: boolean;
  user?: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    profileVersion?: string | null;
  } | null;
  onSignOut?: () => void;
  onUserUpdated?: (user: ProfileUserResponse) => void;
};

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.13-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
    </svg>
  );
}

function ThemeToggle({
  theme,
  onSelect,
}: {
  theme: DashboardTheme;
  onSelect: (theme: DashboardTheme) => void;
}) {
  const btnClass = (active: boolean) =>
    ["dashboard-theme-toggle-btn", active ? "is-active" : ""].join(" ");

  return (
    <div className="dashboard-theme-toggle dashboard-theme-toggle--menu" role="group" aria-label="Тема">
      <button
        type="button"
        role="menuitemradio"
        aria-checked={theme === "light"}
        className={btnClass(theme === "light")}
        aria-label="Светлая тема"
        onClick={() => onSelect("light")}
      >
        <img
          src="/assets/portfolio-ui/light.svg"
          alt=""
          aria-hidden
          className="dashboard-theme-toggle-icon"
        />
      </button>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={theme === "dark"}
        className={btnClass(theme === "dark")}
        aria-label="Тёмная тема"
        onClick={() => onSelect("dark")}
      >
        <img
          src="/assets/portfolio-ui/dark.svg"
          alt=""
          aria-hidden
          className="dashboard-theme-toggle-icon"
        />
      </button>
    </div>
  );
}

export function DashboardSettings({
  prefs,
  onChange,
  onOpenAuth,
  isLoggedIn,
  user,
  onSignOut,
  onUserUpdated,
}: Props) {
  const avatarLetter = isLoggedIn ? dashboardUserAvatarLetter(user?.name, user?.email) : null;
  const avatarImageUrl = useMemo(
    () => (isLoggedIn ? profileAvatarUrl(user?.image, user?.profileVersion) : null),
    [isLoggedIn, user?.image, user?.profileVersion],
  );
  const avatarBackground = useMemo(
    () => (isLoggedIn ? dashboardUserAvatarBackground(user?.id, user?.email) : undefined),
    [isLoggedIn, user?.id, user?.email],
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const patch = (partial: Partial<DashboardPrefs>) => {
    onChange({
      ...prefs,
      ...partial,
      gridOpacity:
        partial.gridOpacity !== undefined
          ? clampGridOpacity(partial.gridOpacity)
          : prefs.gridOpacity,
    });
  };

  const profileUser = user ?? {
    id: "guest-preview",
    name: "Максим",
    email: "guest@preview.local",
    image: null,
  };

  return (
    <div
      ref={wrapRef}
      className={`dashboard-floating-actions-settings${profileOpen ? " dashboard-floating-actions-settings--panel-open" : ""}`}
    >
      <div className="dashboard-floating-actions-settings-slot">
        <div className="dashboard-floating-actions-settings-stack">
          <button
            type="button"
            className="dashboard-floating-action-btn btn-glass"
            aria-label={isLoggedIn ? "Аккаунт" : "Войти"}
            onClick={() => {
              if (!isLoggedIn) onOpenAuth();
            }}
          >
            {isLoggedIn && avatarImageUrl ? (
              <img
                src={avatarImageUrl}
                alt=""
                aria-hidden
                className="dashboard-floating-action-avatar-image"
              />
            ) : isLoggedIn && avatarLetter ? (
              <span
                className="dashboard-floating-action-avatar"
                style={{ backgroundColor: avatarBackground }}
                aria-hidden
              >
                {avatarLetter}
              </span>
            ) : (
              <img
                src="/assets/portfolio-ui/user-circle.svg"
                alt=""
                aria-hidden
                className="dashboard-floating-action-icon dashboard-floating-action-icon--user"
              />
            )}
          </button>
          <div className="dashboard-floating-action-expanded" role="menu" aria-label="Быстрые настройки">
            <button
              type="button"
              role="menuitem"
              className="dashboard-floating-action-expanded-btn dashboard-floating-action-expanded-btn--settings"
              aria-label="Настройки"
              onClick={() => setProfileOpen(true)}
            >
              <GearIcon className="dashboard-floating-action-expanded-gear" />
            </button>
            <ThemeToggle theme={prefs.theme} onSelect={(theme) => patch({ theme })} />
            {isLoggedIn ? (
              <button
                type="button"
                role="menuitem"
                className="dashboard-floating-action-expanded-btn dashboard-floating-action-expanded-btn--logout"
                aria-label="Выйти"
                onClick={() => onSignOut?.()}
              >
                <img
                  src="/assets/portfolio-ui/log_out.svg"
                  alt=""
                  aria-hidden
                  className="dashboard-floating-action-expanded-logout-icon"
                />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {profileOpen ? <div className="dashboard-floating-actions-settings-hover-bridge" aria-hidden /> : null}

      {profileOpen ? (
        <Suspense fallback={null}>
          <ProfileSettingsModal
            open
            prefs={prefs}
            user={profileUser}
            canPersistProfile={isLoggedIn && user != null && user.id !== "guest-preview"}
            onClose={() => setProfileOpen(false)}
            onPrefsChange={onChange}
            onUserUpdated={onUserUpdated}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
