import { SceneData } from '../models/types.js';

// Simple IndexedDB wrapper for storing scenes by id, with a small metadata
// table for the "resume" pointer (last opened scene id).

const DB_NAME = 'arrow-mindmap';
const DB_VERSION = 1;
const SCENES_STORE = 'scenes';
const META_STORE = 'meta';

export interface SceneSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export class IndexedDBStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(SCENES_STORE)) {
            db.createObjectStore(SCENES_STORE, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(META_STORE)) {
            db.createObjectStore(META_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      } catch (e) {
        reject(e);
      }
    });
    return this.dbPromise;
  }

  private async tx<T>(
    storeNames: string | string[],
    mode: IDBTransactionMode,
    fn: (tx: IDBTransaction) => Promise<T> | T,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeNames, mode);
      let result!: T;
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('tx aborted'));
      Promise.resolve(fn(transaction))
        .then((r) => {
          result = r;
        })
        .catch(reject);
    });
  }

  async saveScene(scene: SceneData): Promise<void> {
    await this.tx(SCENES_STORE, 'readwrite', (tx) => {
      tx.objectStore(SCENES_STORE).put(scene);
    });
  }

  async loadScene(id: string): Promise<SceneData | null> {
    return this.tx(SCENES_STORE, 'readonly', (tx) => {
      return new Promise<SceneData | null>((resolve, reject) => {
        const req = tx.objectStore(SCENES_STORE).get(id);
        req.onsuccess = () => resolve((req.result as SceneData) ?? null);
        req.onerror = () => reject(req.error);
      });
    });
  }

  async listScenes(): Promise<SceneSummary[]> {
    return this.tx(SCENES_STORE, 'readonly', (tx) => {
      return new Promise<SceneSummary[]>((resolve, reject) => {
        const req = tx.objectStore(SCENES_STORE).getAll();
        req.onsuccess = () => {
          const all = (req.result as SceneData[]) ?? [];
          all.sort((a, b) => b.updatedAt - a.updatedAt);
          resolve(all.map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt })));
        };
        req.onerror = () => reject(req.error);
      });
    });
  }

  async deleteScene(id: string): Promise<void> {
    await this.tx(SCENES_STORE, 'readwrite', (tx) => {
      tx.objectStore(SCENES_STORE).delete(id);
    });
  }

  async renameScene(id: string, name: string): Promise<void> {
    const existing = await this.loadScene(id);
    if (!existing) return;
    existing.name = name;
    existing.updatedAt = Date.now();
    await this.saveScene(existing);
  }

  async setMeta<T>(key: string, value: T): Promise<void> {
    await this.tx(META_STORE, 'readwrite', (tx) => {
      tx.objectStore(META_STORE).put(value as unknown as object, key);
    });
  }

  async getMeta<T>(key: string): Promise<T | null> {
    return this.tx(META_STORE, 'readonly', (tx) => {
      return new Promise<T | null>((resolve, reject) => {
        const req = tx.objectStore(META_STORE).get(key);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => reject(req.error);
      });
    });
  }

  async exportAll(): Promise<{ scenes: SceneData[]; version: number }> {
    const scenes = await this.tx(SCENES_STORE, 'readonly', (tx) => {
      return new Promise<SceneData[]>((resolve, reject) => {
        const req = tx.objectStore(SCENES_STORE).getAll();
        req.onsuccess = () => resolve((req.result as SceneData[]) ?? []);
        req.onerror = () => reject(req.error);
      });
    });
    return { scenes, version: DB_VERSION };
  }

  async importAll(payload: { scenes: SceneData[] }, merge: boolean = true): Promise<number> {
    if (!payload || !Array.isArray(payload.scenes)) {
      throw new Error('Invalid import payload');
    }
    return this.tx(SCENES_STORE, 'readwrite', (tx) => {
      const store = tx.objectStore(SCENES_STORE);
      if (!merge) store.clear();
      let count = 0;
      for (const s of payload.scenes) {
        if (s && typeof s.id === 'string') {
          store.put(s);
          count++;
        }
      }
      return count;
    });
  }
}
