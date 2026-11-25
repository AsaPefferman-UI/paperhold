import { useBusy } from '../lib/busy.ts';
import { applyUpdate, useUpdateAvailable } from '../lib/sw.ts';

/** Shown when a new version is installed and waiting. Never interrupts work in progress. */
export function UpdateBanner() {
  const available = useUpdateAvailable();
  const busy = useBusy();
  if (!available) return null;
  return (
    <div className="update-banner" role="status">
      <p>A new version of this site is ready.</p>
      <button type="button" className="button button-primary" disabled={busy} onClick={applyUpdate}>
        Reload for update
      </button>
      {busy && <p className="hint">Available when the current task finishes.</p>}
    </div>
  );
}
