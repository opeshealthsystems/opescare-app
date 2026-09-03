import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Encrypted-at-rest key/value storage for the offline cache.
 *
 * Same platform branch the rest of the app already uses (lib/api/tokenStorage.ts,
 * lib/store/auth.ts, app/(auth)/permissions.tsx): expo-secure-store on the
 * native builds that actually ship, localStorage on web purely so the app stays
 * previewable in a browser during development.
 *
 * Honesty note on the backend's `encryption_policy` ("AES-256-GCM local database
 * encryption required"): on Android expo-secure-store encrypts values with
 * AES-256-GCM under a key held in the hardware-backed Android Keystore, and on
 * iOS it stores them in the Keychain — that is a real at-rest guarantee. On
 * **web there is none**: localStorage is plaintext, which is why
 * `isEncryptedAtRest` is exported and app/offline-access.tsx shows an explicit
 * warning before a browser user opts in.
 *
 * SecureStore rejects large values (historically ~2048 bytes on iOS), so native
 * writes are transparently split into chunks with a count header at the base
 * key. Web has no such limit and stores the value directly.
 */

const CHUNK_SIZE = 1600;
const MAX_CHUNKS = 512; // ~800 KB ceiling; a runaway payload fails loudly instead of filling the keychain

export const isEncryptedAtRest = Platform.OS !== 'web';

const webStore = {
  getItem: (key: string): string | null =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null,
  setItem: (key: string, value: string): void => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
  removeItem: (key: string): void => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  },
};

const chunkKey = (key: string, index: number) => `${key}__${index}`;

async function readNative(key: string): Promise<string | null> {
  const header = await SecureStore.getItemAsync(key);
  if (header === null) return null;

  const count = Number.parseInt(header, 10);
  if (!Number.isFinite(count) || count < 0 || count > MAX_CHUNKS) return null;

  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const part = await SecureStore.getItemAsync(chunkKey(key, i));
    // A missing chunk means a half-written/half-wiped record — treat the whole
    // entry as absent rather than handing back a truncated medical record.
    if (part === null) return null;
    parts.push(part);
  }
  return parts.join('');
}

async function writeNative(key: string, value: string): Promise<void> {
  const previous = await SecureStore.getItemAsync(key);
  const previousCount = previous ? Number.parseInt(previous, 10) : 0;

  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }
  if (chunks.length > MAX_CHUNKS) {
    throw new Error(`Offline cache entry "${key}" is too large to store securely.`);
  }

  for (let i = 0; i < chunks.length; i += 1) {
    await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
  }
  await SecureStore.setItemAsync(key, String(chunks.length));

  // Drop chunks left behind by a previously longer value.
  if (Number.isFinite(previousCount)) {
    for (let i = chunks.length; i < previousCount; i += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {});
    }
  }
}

async function deleteNative(key: string): Promise<void> {
  const header = await SecureStore.getItemAsync(key);
  const count = header ? Number.parseInt(header, 10) : 0;
  if (Number.isFinite(count)) {
    for (let i = 0; i < count; i += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {});
    }
  }
  await SecureStore.deleteItemAsync(key).catch(() => {});
}

export const offlineStorage = {
  async getString(key: string): Promise<string | null> {
    try {
      return Platform.OS === 'web' ? webStore.getItem(key) : await readNative(key);
    } catch {
      return null;
    }
  },

  async setString(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      webStore.setItem(key, value);
      return;
    }
    await writeNative(key, value);
  },

  async remove(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        webStore.removeItem(key);
        return;
      }
      await deleteNative(key);
    } catch {
      // Best-effort: a failed delete must never block sign-out or cache clearing.
    }
  },

  /** Reads and parses a JSON record, returning null on absence or corruption. */
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await offlineStorage.getString(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async setJson(key: string, value: unknown): Promise<void> {
    await offlineStorage.setString(key, JSON.stringify(value));
  },
};
