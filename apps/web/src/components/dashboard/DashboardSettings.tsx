import { useEffect, useRef, useState } from "react";
import type { DashboardPrefs } from "../../lib/dashboardPrefs";
import { clampGridOpacity } from "../../lib/dashboardPrefs";

type Props = {
  prefs: DashboardPrefs;
  onChange: (next: DashboardPrefs) => void;
};

function GearIcon() {
  return (
    <svg className="h-6 w-6 text-slate-200" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
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
    <div ref={wrapRef} className="pointer-events-auto relative">
      <button
        type="button"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-600/80 bg-slate-800/95 shadow-lg backdrop-blur-sm transition hover:bg-slate-700/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Настройки дашборда"
        onClick={() => setOpen((v) => !v)}
      >
        <GearIcon />
      </button>

      {open ? (
        <div
          className="absolute right-0 mt-3 w-[min(calc(100vw-2rem),18rem)] rounded-2xl border border-slate-600/80 bg-slate-900/98 p-4 shadow-xl backdrop-blur-md"
          role="dialog"
          aria-label="Настройки"
        >
          <h2 className="mb-3 text-sm font-semibold text-slate-100">Настройки</h2>
          <div className="flex flex-col gap-4 text-sm">
            <label className="flex flex-col gap-1.5 text-slate-300">
              <span>Тема</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => patch({ theme: "light" })}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                    prefs.theme === "light"
                      ? "border-sky-500 bg-sky-500/20 text-sky-200"
                      : "border-slate-600 bg-slate-950 text-slate-200"
                  }`}
                >
                  Светлая
                </button>
                <button
                  type="button"
                  onClick={() => patch({ theme: "dark" })}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                    prefs.theme === "dark"
                      ? "border-sky-500 bg-sky-500/20 text-sky-200"
                      : "border-slate-600 bg-slate-950 text-slate-200"
                  }`}
                >
                  Темная
                </button>
              </div>
            </label>

            <label className="flex flex-col gap-1.5 text-slate-300">
              <span>Прозрачность сетки (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={prefs.gridOpacity}
                onChange={(e) => patch({ gridOpacity: Number(e.target.value) })}
                className="rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 font-mono text-slate-200"
              />
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={prefs.gridOpacity}
                onChange={(e) => patch({ gridOpacity: Number(e.target.value) })}
                className="w-full accent-sky-500"
                aria-label="Прозрачность сетки"
              />
              <p className="text-xs text-slate-500">0 — скрыть, 100 — максимум.</p>
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
