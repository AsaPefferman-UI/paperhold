// Counts operations in progress, so the app never swaps code (service worker update) or lets
// the tab close silently while a file is being processed.
import { useSyncExternalStore } from 'react';

let running = 0;
const listeners = new Set<() => void>();

const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();

function set(next: number): void {
  const was = running > 0;
  running = Math.max(0, next);
  if (was !== running > 0 && typeof window !== 'undefined') {
    if (running > 0) window.addEventListener('beforeunload', onBeforeUnload);
    else window.removeEventListener('beforeunload', onBeforeUnload);
  }
  for (const l of listeners) l();
}

/** Mark work as started; call the returned function exactly once when it ends. */
export function startBusy(): () => void {
  set(running + 1);
  let done = false;
  return () => {
    if (!done) set(running - 1);
    done = true;
  };
}

export const isBusy = () => running > 0;

export function useBusy(): boolean {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    isBusy,
    () => false,
  );
}
