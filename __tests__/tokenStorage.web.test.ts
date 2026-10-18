jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { fakeStorage, setGlobal, setPlatformOS } from './helpers';

const KEY = 'opescare_patient_token';

describe('tokenStorage (web)', () => {
  let restores: (() => void)[] = [];
  let local: ReturnType<typeof fakeStorage>;
  let session: ReturnType<typeof fakeStorage>;

  function load(): typeof import('@/lib/api/tokenStorage') {
    let mod!: typeof import('@/lib/api/tokenStorage');
    jest.isolateModules(() => {
      restores.push(setPlatformOS('web', require('react-native').Platform));
      mod = require('@/lib/api/tokenStorage');
    });
    return mod;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    local = fakeStorage({ [KEY]: 'legacy-plaintext-token', unrelated: 'keep' });
    session = fakeStorage();
    restores = [
      setPlatformOS('web'),
      setGlobal('localStorage', local),
      setGlobal('sessionStorage', session),
    ];
  });
  afterEach(() => restores.reverse().forEach((r) => r()));

  it('purges the legacy localStorage token on module load', () => {
    load();
    expect(local.data.has(KEY)).toBe(false);
    expect(local.data.get('unrelated')).toBe('keep');
  });

  it('does not adopt the legacy localStorage token', async () => {
    const { tokenStorage } = load();
    await expect(tokenStorage.get()).resolves.toBeNull();
  });

  it('keeps the token in memory and mirrors it only to sessionStorage', async () => {
    const { tokenStorage } = load();
    await tokenStorage.set('jwt-1');
    await expect(tokenStorage.get()).resolves.toBe('jwt-1');
    expect(session.data.get(KEY)).toBe('jwt-1');
    expect(local.setItem).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('restores the token from sessionStorage after a reload', async () => {
    session.data.set(KEY, 'jwt-from-reload');
    const { tokenStorage } = load();
    await expect(tokenStorage.get()).resolves.toBe('jwt-from-reload');
  });

  it('clear wipes memory, sessionStorage and any legacy copy', async () => {
    const { tokenStorage } = load();
    await tokenStorage.set('jwt-2');
    local.data.set(KEY, 'reappeared');
    await tokenStorage.clear();
    await expect(tokenStorage.get()).resolves.toBeNull();
    expect(session.data.has(KEY)).toBe(false);
    expect(local.data.has(KEY)).toBe(false);
  });

  it('still holds the token in memory when sessionStorage throws', async () => {
    session.setItem.mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    const { tokenStorage } = load();
    await expect(tokenStorage.set('jwt-3')).resolves.toBeUndefined();
    await expect(tokenStorage.get()).resolves.toBe('jwt-3');
  });

  it('purgeLegacyWebToken tolerates blocked storage', () => {
    const { purgeLegacyWebToken } = load();
    local.removeItem.mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => purgeLegacyWebToken()).not.toThrow();
  });
});
