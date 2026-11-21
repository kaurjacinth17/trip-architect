// Booking confirmations and tickets kept on this device (IndexedDB), never uploaded. Up to 5 MB each.
const DB = 'trip-architect-files', STORE = 'files';
export const MAX_FILE = 5 * 1024 * 1024;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export const putFile = (id: string, f: Blob) => tx('readwrite', (s) => s.put(f, id));
export const getFile = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id));
export const deleteFile = (id: string) => tx('readwrite', (s) => s.delete(id));
export async function openFile(id: string) {
  const b = await getFile(id);
  if (!b) return false;
  const url = URL.createObjectURL(b);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
