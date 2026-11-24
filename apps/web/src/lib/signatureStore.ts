// Opt-in storage of one signature image on this device (IndexedDB). Nothing is stored unless
// the user ticks "Remember", and "Forget" deletes it. Every call tolerates storage being
// unavailable (private windows, blocked site data).
const DB = 'pdf-tools';
const STORE = 'signatures';
const KEY = 'default';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  work: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = work(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

// Stored as raw bytes: some engines (WebKit builds) cannot persist Blobs in IndexedDB.
interface Stored {
  type: string;
  bytes: ArrayBuffer;
}

export async function loadSignature(): Promise<Blob | null> {
  try {
    const v = await tx<Stored | undefined>('readonly', (s) => s.get(KEY));
    return v?.bytes instanceof ArrayBuffer ? new Blob([v.bytes], { type: v.type }) : null;
  } catch {
    return null;
  }
}

export async function saveSignature(png: Blob): Promise<boolean> {
  try {
    const record: Stored = { type: png.type, bytes: await png.arrayBuffer() };
    await tx('readwrite', (s) => s.put(record, KEY));
    return true;
  } catch {
    return false;
  }
}

export async function forgetSignature(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(KEY));
  } catch {
    // Nothing stored, or storage unavailable: nothing to forget.
  }
}
