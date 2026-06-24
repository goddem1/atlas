import { useLayoutEffect, useRef } from "react";

/** Синхронизирует layout при resize/scroll, не чаще одного кадра (rAF). */
export function useRafLayoutSync(active: boolean, measure: () => void): void {
  const measureRef = useRef(measure);
  measureRef.current = measure;

  useLayoutEffect(() => {
    if (!active) return;

    let rafId = 0;
    const schedule = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        measureRef.current();
      });
    };

    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [active]);
}
