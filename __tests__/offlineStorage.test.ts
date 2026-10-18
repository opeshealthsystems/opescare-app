jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      store.delete(k);
    }),
  };
});

import * as SecureStore from 'expo-secure-store';
import { fakeStorage, setGlobal, setPlatformOS } from './helpers';

const secure = SecureStore as unknown as { __store: Map<string, string> } & typeof SecureStore;

function load(os: string, restores: (() => void)[]) {
  let mod!: typeof import('@/lib/offline/storage');
  jest.isolateModules(() => {
    restores.push(setPlatformOS(os, require('react-native').Platform));
    mod = require('@/lib/offline/storage');
  });
  restores.push(setPlatformOS(os));
  return mod;
}

describe('offlineStorage (web)', () => {
  const restores: (() => void)[] = [];
  let local: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    secure.__store.clear();
    local = fakeStorage({ opescare_offline_scope_a: '{"secret":1}', other: 'x' });
    restores.push(setGlobal('localStorage', local));
  });
  afterEach(() => restores.splice(0).reverse().forEach((r) => r()));

  it('is not encrypted at rest', () => {
    expect(load('web', restores).isEncryptedAtRest).toBe(false);
  });

  it('drops writes and reads back null', async () => {
    const { offlineStorage } = load('web', restores);
    await offlineStorage.setJson('k', { name: 'patient' });
    await expect(offlineStorage.getJson('k')).resolves.toBeNull();
    await expect(offlineStorage.getString('k')).resolves.toBeNull();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it('remove is a no-op that never throws', async () => {
    const { offlineStorage } = load('web', restores);
    await expect(offlineStorage.remove('k')).resolves.toBeUndefined();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('purges legacy plaintext offline records on load', () => {
    load('web', restores);
    expect(local.data.has('opescare_offline_scope_a')).toBe(false);
    expect(local.data.get('other')).toBe('x');
  });
});

describe('offlineStorage (native)', () => {
  const restores: (() => void)[] = [];
  beforeEach(() => {
    jest.clearAllMocks();
    secure.__store.clear();
  });
  afterEach(() => restores.splice(0).reverse().forEach((r) => r()));

  it('is encrypted at rest and round-trips a chunked value', async () => {
    const mod = load('android', restores);
    expect(mod.isEncryptedAtRest).toBe(true);
    const big = 'x'.repeat(4000);
    await mod.offlineStorage.setString('rec', big);
    expect(secure.__store.get('rec')).toBe('3');
    await expect(mod.offlineStorage.getString('rec')).resolves.toBe(big);
  });

  it('treats a record with a missing chunk as absent', async () => {
    const { offlineStorage } = load('android', restores);
    await offlineStorage.setString('rec', 'y'.repeat(3300));
    secure.__store.delete('rec__1');
    await expect(offlineStorage.getString('rec')).resolves.toBeNull();
  });

  it('remove deletes every chunk and the header', async () => {
    const { offlineStorage } = load('android', restores);
    await offlineStorage.setString('rec', 'z'.repeat(3300));
    await offlineStorage.remove('rec');
    expect(secure.__store.size).toBe(0);
  });
});
