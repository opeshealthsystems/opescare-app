jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'native-token'),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { fakeStorage, setGlobal } from './helpers';

describe('tokenStorage (native)', () => {
  let tokenStorage: typeof import('@/lib/api/tokenStorage').tokenStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.isolateModules(() => {
      tokenStorage = require('@/lib/api/tokenStorage').tokenStorage;
    });
  });

  it('runs on a native platform', () => {
    expect(Platform.OS).not.toBe('web');
  });

  it('reads the token from SecureStore', async () => {
    await expect(tokenStorage.get()).resolves.toBe('native-token');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('opescare_patient_token');
  });

  it('writes the token to SecureStore', async () => {
    await tokenStorage.set('abc');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('opescare_patient_token', 'abc');
  });

  it('deletes the token from SecureStore on clear', async () => {
    await tokenStorage.clear();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('opescare_patient_token');
  });

  it('never touches web storage on native', async () => {
    const session = fakeStorage();
    const restore = setGlobal('sessionStorage', session);
    await tokenStorage.set('abc');
    expect(session.setItem).not.toHaveBeenCalled();
    restore();
  });
});
