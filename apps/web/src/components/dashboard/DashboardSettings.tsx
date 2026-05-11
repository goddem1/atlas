import { useEffect, useRef, useState } from "react";
import type { DashboardPrefs } from "../../lib/dashboardPrefs";
import { clampGridOpacity } from "../../lib/dashboardPrefs";

type Props = {
  prefs: DashboardPrefs;
  onChange: (next: DashboardPrefs) => void;
};

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.13-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
    </svg>
  );
}

export function DashboardSettings({ prefs, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent | PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

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

  return (
    <div
      ref={wrapRef}
      className={`dashboard-floating-actions-settings${open ? " dashboard-floating-actions-settings--panel-open" : ""}`}
    >
      <div className="dashboard-floating-actions-settings-slot">
        <div className="dashboard-floating-actions-settings-stack">
          <button
            type="button"
            className="dashboard-floating-action-btn btn-glass"
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label="Меню дашборда"
            onClick={() => setOpen((v) => !v)}
          />
          <div className="dashboard-floating-action-expanded" role="menu" aria-label="Быстрые настройки">
            <button
              type="button"
              role="menuitem"
              className="dashboard-floating-action-expanded-btn"
              onClick={() => patch({ theme: "light" })}
            >
              Светлая тема
            </button>
            <button
              type="button"
              role="menuitem"
              className="dashboard-floating-action-expanded-btn"
              onClick={() => patch({ theme: "dark" })}
            >
              Тёмная тема
            </button>
            <button
              type="button"
              role="menuitem"
              className="dashboard-floating-action-expanded-btn dashboard-floating-action-expanded-btn--settings"
              aria-label="Настройки"
              onClick={() => setOpen(true)}
            >
              <GearIcon className="dashboard-floating-action-expanded-gear" />
            </button>
          </div>
        </div>
      </div>

      {open ? <div className="dashboard-floating-actions-settings-hover-bridge" aria-hidden /> : null}

      {open ? (
        <div className="dashboard-floating-actions-panel" role="dialog" aria-label="Настройки">
          <h2 className="dashboard-floating-actions-panel-title">Настройки</h2>
          <div className="dashboard-floating-actions-panel-body">
            <label className="dashboard-floating-actions-field">
              <span>Тема</span>
              <div className="dashboard-floating-actions-theme-grid">
                <button
                  type="button"
                  onClick={() => patch({ theme: "light" })}
                  className={
                    prefs.theme === "light"
                      ? "dashboard-floating-actions-chip dashboard-floating-actions-chip--active"
                      : "dashboard-floating-actions-chip dashboard-floating-actions-chip--inactive"
                  }
                >
                  Светлая
                </button>
                <button
                  type="button"
                  onClick={() => patch({ theme: "dark" })}
                  className={
                    prefs.theme === "dark"
                      ? "dashboard-floating-actions-chip dashboard-floating-actions-chip--active"
                      : "dashboard-floating-actions-chip dashboard-floating-actions-chip--inactive"
                  }
                >
                  Темная
                </button>
              </div>
            </label>

            <label className="dashboard-floating-actions-field">
              <span>Прозрачность сетки (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={prefs.gridOpacity}
                onChange={(e) => patch({ gridOpacity: Number(e.target.value) })}
                className="dashboard-floating-actions-input"
              />
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={prefs.gridOpacity}
                onChange={(e) => patch({ gridOpacity: Number(e.target.value) })}
                className="dashboard-floating-actions-range"
                aria-label="Прозрачность сетки"
              />
              <p className="dashboard-floating-actions-hint">0 — скрыть, 100 — максимум.</p>
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
