import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchProfile,
  profileAvatarUrl,
  resolveApiAssetUrl,
  updateProfileName,
  uploadProfileAvatar,
  type ProfileUserResponse,
} from "../../services/api";
import {
  clampGridOpacity,
  type DashboardDisplayCurrency,
  type DashboardLanguage,
  type DashboardPrefs,
  type DashboardTheme,
} from "../../lib/dashboardPrefs";
import { useRafLayoutSync } from "../../lib/useRafLayoutSync";
import { useBackdropBlurPause } from "../../lib/useBackdropBlurPause";
import { dashboardUserAvatarBackground, dashboardUserAvatarLetter } from "../auth/auth-utils";
import "../widgets/portfolio/portfolio-widget.css";
import "./profile-settings-modal.css";

type UserInfo = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  profileVersion?: string | null;
};

type Props = {
  open: boolean;
  prefs: DashboardPrefs;
  user: UserInfo;
  canPersistProfile?: boolean;
  onClose: () => void;
  onPrefsChange: (next: DashboardPrefs) => void;
  onUserUpdated?: (user: ProfileUserResponse) => void;
};

const LANGUAGE_OPTIONS: { value: DashboardLanguage; label: string }[] = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
];

const CURRENCY_OPTIONS: { value: DashboardDisplayCurrency; label: string }[] = [
  { value: "rub", label: "₽" },
  { value: "eur", label: "€" },
  { value: "usd", label: "$" },
];

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

function patchPrefs(prefs: DashboardPrefs, partial: Partial<DashboardPrefs>): DashboardPrefs {
  return {
    ...prefs,
    ...partial,
    gridOpacity:
      partial.gridOpacity !== undefined ? clampGridOpacity(partial.gridOpacity) : prefs.gridOpacity,
  };
}

type SettingsComboboxProps<T extends string> = {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
};

function SettingsCombobox<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: SettingsComboboxProps<T>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const selected = options.find((opt) => opt.value === value);

  useLayoutEffect(() => {
    if (!menuOpen) setMenuRect(null);
  }, [menuOpen]);

  useRafLayoutSync(menuOpen, () => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuRect({ left: rect.left, top: rect.bottom + 5, width: rect.width });
  });

  const menu =
    !disabled && menuOpen && menuRect
      ? createPortal(
          <div
            className="portfolio-asset-select-menu profile-settings-combobox-menu"
            style={{ left: menuRect.left, top: menuRect.top, width: menuRect.width }}
            role="listbox"
            aria-label={label}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={cn(
                  "portfolio-asset-option list-on-glass",
                  opt.value === value && "active portfolio-asset-option--active",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(opt.value);
                  setMenuOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {menu}
      <label
        className={cn(
          "portfolio-field portfolio-ghost-field is-floated profile-settings-combobox-field",
          disabled && "profile-settings-combobox-field--disabled",
        )}
      >
        <span className="portfolio-ghost-label">{label}</span>
        <div ref={anchorRef} className="portfolio-asset-combobox">
          <input
            readOnly
            disabled={disabled}
            value={selected?.label ?? ""}
            aria-label={label}
            aria-disabled={disabled}
            placeholder=" "
            className="portfolio-input-ghost portfolio-asset-combobox-input"
            onFocus={() => {
              if (!disabled) setMenuOpen(true);
            }}
            onClick={() => {
              if (!disabled) setMenuOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => setMenuOpen(false), 120);
            }}
          />
          <img
            src="/assets/portfolio-ui/arrow_down.svg"
            alt=""
            aria-hidden="true"
            className="portfolio-asset-combobox-arrow"
          />
        </div>
      </label>
    </>
  );
}

export function ProfileSettingsModal({
  open,
  prefs,
  user,
  canPersistProfile = false,
  onClose,
  onPrefsChange,
  onUserUpdated,
}: Props) {
  useBackdropBlurPause(open);
  const [draftName, setDraftName] = useState(user.name);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    () => profileAvatarUrl(user.image, user.profileVersion) ?? resolveApiAssetUrl(user.image),
  );
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarLetter = dashboardUserAvatarLetter(draftName || user.name, user.email);
  const avatarBackground = dashboardUserAvatarBackground(user.id, user.email);

  useEffect(() => {
    if (!open) return;
    setDraftName(user.name);
    setAvatarPreview(profileAvatarUrl(user.image, user.profileVersion) ?? resolveApiAssetUrl(user.image));
  }, [open, user.name, user.image, user.profileVersion]);

  useEffect(() => {
    if (!open || !canPersistProfile) return;
    let cancelled = false;
    void fetchProfile()
      .then((profile) => {
        if (cancelled) return;
        setDraftName(profile.name);
        setAvatarPreview(profileAvatarUrl(profile.image, profile.updatedAt));
        onUserUpdated?.(profile);
      })
      .catch(() => {
        /* остаёмся на данных сессии */
      });
    return () => {
      cancelled = true;
    };
  }, [open, canPersistProfile, onUserUpdated]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const commitName = () => {
    const next = draftName.trim();
    if (!next || next === user.name) {
      setDraftName(user.name);
      return;
    }
    if (!canPersistProfile) return;
    void updateProfileName(next)
      .then((updated) => {
        setDraftName(updated.name);
        onUserUpdated?.(updated);
      })
      .catch(() => setDraftName(user.name));
  };

  const onPhotoSelected = (file: File | null) => {
    if (!file || avatarUploading) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      if (!canPersistProfile) {
        setAvatarPreview(reader.result);
        return;
      }
      setAvatarUploading(true);
      void uploadProfileAvatar(reader.result)
        .then((updated) => {
          setAvatarPreview(profileAvatarUrl(updated.image, updated.updatedAt));
          onUserUpdated?.(updated);
        })
        .catch(() => {
          setAvatarPreview(profileAvatarUrl(user.image, user.profileVersion) ?? resolveApiAssetUrl(user.image));
        })
        .finally(() => {
          setAvatarUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        });
    };
    reader.readAsDataURL(file);
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="profile-settings-backdrop-layer" role="presentation">
        <button type="button" className="profile-settings-backdrop" aria-label="Закрыть" onClick={onClose} />
      </div>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-settings-title"
        className="profile-settings-dialog atlas-glass"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-settings-header">
          <div className="profile-settings-header-backdrop atlas-glass" aria-hidden="true" />
          <h2 id="profile-settings-title" className="profile-settings-title">
            Мой профиль
          </h2>
          <button type="button" className="profile-settings-close btn-glass" onClick={onClose} aria-label="Закрыть">
            <img src="/assets/portfolio-ui/close.svg" alt="" className="profile-settings-close-icon" />
          </button>
        </div>

        <div className="profile-settings-body">
          <div className="profile-settings-profile">
            <div className="profile-settings-avatar btn-glass" aria-hidden="true">
              <div className="profile-settings-avatar-photo">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className="profile-settings-avatar-image" />
                ) : (
                  <span
                    className="profile-settings-avatar-letter"
                    style={{ backgroundColor: avatarBackground }}
                  >
                    {avatarLetter}
                  </span>
                )}
              </div>
            </div>
            <div className="profile-settings-profile-fields">
              <label
                className={cn(
                  "portfolio-field portfolio-ghost-field profile-settings-name-field",
                  draftName && "is-floated",
                )}
              >
                <span className="portfolio-ghost-label">Имя</span>
                <input
                  type="text"
                  className="portfolio-input-ghost list-on-glass"
                  value={draftName}
                  aria-label="Имя"
                  placeholder=" "
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                />
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => onPhotoSelected(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className="profile-settings-upload-link"
                disabled={avatarUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarUploading ? "Загрузка…" : "Загрузить фото →"}
              </button>
            </div>
          </div>

          <button type="button" className="profile-settings-action-btn" disabled>
            Сменить пароль
          </button>

          <div className="profile-settings-field">
            <p className="profile-settings-field-label">Общие настройки</p>
            <div
              className="profile-settings-theme-toggle"
              role="radiogroup"
              aria-label="Тема"
            >
              <button
                type="button"
                role="radio"
                aria-checked={prefs.theme === "light"}
                className={cn("profile-settings-theme-btn", prefs.theme === "light" && "is-active")}
                aria-label="Светлая тема"
                onClick={() => onPrefsChange(patchPrefs(prefs, { theme: "light" satisfies DashboardTheme }))}
              >
                <img
                  src="/assets/portfolio-ui/light.svg"
                  alt=""
                  className="profile-settings-theme-icon"
                  aria-hidden
                />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={prefs.theme === "dark"}
                className={cn("profile-settings-theme-btn", prefs.theme === "dark" && "is-active")}
                aria-label="Тёмная тема"
                onClick={() => onPrefsChange(patchPrefs(prefs, { theme: "dark" satisfies DashboardTheme }))}
              >
                <img
                  src="/assets/portfolio-ui/dark.svg"
                  alt=""
                  className="profile-settings-theme-icon"
                  aria-hidden
                />
              </button>
            </div>
            <SettingsCombobox
              label="Язык"
              value={prefs.language}
              options={LANGUAGE_OPTIONS}
              onChange={(language) => onPrefsChange(patchPrefs(prefs, { language }))}
              disabled
            />
            <div
              className="profile-settings-currency-switch profile-settings-currency-switch--disabled"
              role="radiogroup"
              aria-label="Валюта"
              aria-disabled="true"
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  disabled
                  aria-checked={prefs.displayCurrency === opt.value}
                  className={cn(
                    "profile-settings-currency-btn",
                    prefs.displayCurrency === opt.value && "is-active",
                  )}
                  aria-label={opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="profile-settings-field">
            <p className="profile-settings-field-label">Уведомления</p>
            <button
              type="button"
              disabled
              className={cn(
                "profile-settings-action-btn profile-settings-notifications-btn",
                prefs.notificationsDisabled && "is-off",
              )}
            >
              {prefs.notificationsDisabled ? "Вкл. все уведомления" : "Выкл. все уведомления"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
