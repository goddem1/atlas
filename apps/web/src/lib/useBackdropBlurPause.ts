import { useEffect } from "react";
import { acquireBackdropBlurPause } from "./backdropBlurPause";

export function useBackdropBlurPause(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return acquireBackdropBlurPause();
  }, [active]);
}
