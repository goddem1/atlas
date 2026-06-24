import { useSyncExternalStore } from "react";
import { getBackdropBlurPaused, subscribeBackdropBlurPause } from "./backdropBlurPause";

/** true, пока открыт хотя бы один оверлей с backdrop-blur (модалка/попап). */
export function useIsBackdropBlurPaused(): boolean {
  return useSyncExternalStore(subscribeBackdropBlurPause, getBackdropBlurPaused, () => false);
}
