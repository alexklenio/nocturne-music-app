export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  fileName: string;
  mimeType: string;
  size: number;
  addedAt: number;
  favorite: boolean;
  audioBlob?: Blob;
  sourceUrl?: string;
  sourceType?: "local" | "link" | "drive";
};

const DB_NAME = "nocturne-library";
const STORE = "tracks";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getTracks(): Promise<Track[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as Track[]).sort((a, b) => b.addedAt - a.addedAt));
    request.onerror = () => reject(request.error);
  });
}

export async function saveTrack(track: Track): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(track);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteTrack(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
