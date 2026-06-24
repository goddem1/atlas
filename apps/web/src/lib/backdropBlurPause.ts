let pauseCount = 0;

const listeners = new Set<() => void>();

function emitBackdropBlurPause(): void {
  for (const listener of listeners) {
    listener();
  }
}

function syncBackdropBlurPause(): void {
  if (typeof document === "undefined") return;
  if (pauseCount > 0) {
    document.documentElement.dataset.backdropBlurPause = "";
  } else {
    delete document.documentElement.dataset.backdropBlurPause;
  }
  emitBackdropBlurPause();
}

export function getBackdropBlurPaused(): boolean {
  return pauseCount > 0;
}

export function subscribeBackdropBlurPause(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Пока активен хотя бы один оверлей — blur на дашборде под ним отключается. */
export function acquireBackdropBlurPause(): () => void {
  pauseCount += 1;
  syncBackdropBlurPause();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pauseCount = Math.max(0, pauseCount - 1);
    syncBackdropBlurPause();
  };
}
