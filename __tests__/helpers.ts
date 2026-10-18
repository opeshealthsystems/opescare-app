import { Platform } from 'react-native';

/** A minimal in-memory Web Storage implementation. */
export function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key: jest.fn((i: number) => Array.from(data.keys())[i] ?? null),
    getItem: jest.fn((k: string) => (data.has(k) ? (data.get(k) as string) : null)),
    setItem: jest.fn((k: string, v: string) => {
      data.set(k, String(v));
    }),
    removeItem: jest.fn((k: string) => {
      data.delete(k);
    }),
    clear: jest.fn(() => data.clear()),
  };
}

/** Run `fn` with Platform.OS forced to `os`, restoring it afterwards. */
export function setPlatformOS(os: string, platform: { OS: string } = Platform): () => void {
  const original = Object.getOwnPropertyDescriptor(platform, 'OS');
  Object.defineProperty(platform, 'OS', { configurable: true, get: () => os });
  return () => {
    if (original) Object.defineProperty(platform, 'OS', original);
  };
}

export function setGlobal(name: string, value: unknown): () => void {
  const g = globalThis as Record<string, unknown>;
  const had = Object.prototype.hasOwnProperty.call(g, name);
  const prev = g[name];
  Object.defineProperty(g, name, { configurable: true, writable: true, value });
  return () => {
    if (had) Object.defineProperty(g, name, { configurable: true, writable: true, value: prev });
    else delete g[name];
  };
}
