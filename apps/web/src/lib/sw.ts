// Service worker registration and the "Reload for update" flow. A new version waits until the
// user asks for it, and the button is disabled while any operation runs (see busy.ts), so code
// is never swapped mid-operation.
import { useEffect, useState } from 'react';
import { isBusy } from './busy.ts';

let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function track(reg: ServiceWorkerRegistration): void {
  const check = () => {
    // Only offer an update when this page is already controlled by an older version.
    if (reg.waiting && navigator.serviceWorker.controller) {
      waiting = reg.waiting;
      notify();
    }
  };
  check();
  reg.addEventListener('updatefound', () => {
    reg.installing?.addEventListener('statechange', check);
  });
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(track, () => {
      // Offline support is an enhancement; the app works without it.
    });
  });
}

/** Activate the waiting version and reload. Refuses while a file is being processed. */
export function applyUpdate(): boolean {
  if (!waiting || isBusy()) return false;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
    once: true,
  });
  waiting.postMessage('SKIP_WAITING');
  return true;
}

export function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(waiting !== null);
  useEffect(() => {
    const l = () => setAvailable(waiting !== null);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return available;
}
