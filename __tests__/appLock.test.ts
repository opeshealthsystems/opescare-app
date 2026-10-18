jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import { AppState } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { deviceCanLock, installAppLockWatcher, useAppLock } from '@/lib/security/appLock';

const auth = LocalAuthentication.authenticateAsync as jest.Mock;

describe('app lock: enable/disable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppLock.setState({ enabled: false, locked: false });
  });

  it('enabling requires the owner to authenticate', async () => {
    auth.mockResolvedValue({ success: true });
    await expect(useAppLock.getState().setEnabled(true, 'Confirm')).resolves.toBe(true);
    expect(auth).toHaveBeenCalledWith({ promptMessage: 'Confirm', disableDeviceFallback: false });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('opescare_app_lock_enabled', '1');
    expect(useAppLock.getState().enabled).toBe(true);
  });

  it('does not enable when authentication fails', async () => {
    auth.mockResolvedValue({ success: false });
    await expect(useAppLock.getState().setEnabled(true, 'Confirm')).resolves.toBe(false);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(useAppLock.getState().enabled).toBe(false);
  });

  it('disabling also requires authentication', async () => {
    useAppLock.setState({ enabled: true });
    auth.mockResolvedValue({ success: false });
    await expect(useAppLock.getState().setEnabled(false, 'Confirm')).resolves.toBe(false);
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(useAppLock.getState().enabled).toBe(true);
  });

  it('disables after successful authentication', async () => {
    useAppLock.setState({ enabled: true });
    auth.mockResolvedValue({ success: true });
    await expect(useAppLock.getState().setEnabled(false, 'Confirm')).resolves.toBe(true);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('opescare_app_lock_enabled');
    expect(useAppLock.getState().enabled).toBe(false);
  });

  it('load locks on cold start when enabled', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('1');
    await useAppLock.getState().load();
    expect(useAppLock.getState()).toMatchObject({ enabled: true, locked: true, ready: true });
  });

  it('unlock clears the lock only on success, and survives a thrown prompt', async () => {
    useAppLock.setState({ enabled: true, locked: true });
    auth.mockRejectedValueOnce(new Error('cancelled'));
    await expect(useAppLock.getState().unlock('Unlock')).resolves.toBe(false);
    expect(useAppLock.getState().locked).toBe(true);
    auth.mockResolvedValueOnce({ success: true });
    await expect(useAppLock.getState().unlock('Unlock')).resolves.toBe(true);
    expect(useAppLock.getState().locked).toBe(false);
  });

  it('deviceCanLock is false when nothing is enrolled', async () => {
    (LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValueOnce(0);
    await expect(deviceCanLock()).resolves.toBe(false);
    (LocalAuthentication.getEnrolledLevelAsync as jest.Mock).mockResolvedValueOnce(1);
    await expect(deviceCanLock()).resolves.toBe(true);
  });
});

describe('app lock: background watcher', () => {
  let listener: (state: string) => void;
  let remove: jest.Mock;
  let now: number;
  let uninstall: () => void;

  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: never) => {
      listener = fn;
      return { remove };
    }) as never);
    useAppLock.setState({ enabled: true, locked: false });
    uninstall = installAppLockWatcher();
  });
  afterEach(() => {
    uninstall();
    jest.restoreAllMocks();
  });

  it('locks after 60s in the background', () => {
    listener('background');
    now += 60_000;
    listener('active');
    expect(useAppLock.getState().locked).toBe(true);
  });

  it('does not lock before 60s', () => {
    listener('background');
    now += 59_999;
    listener('active');
    expect(useAppLock.getState().locked).toBe(false);
  });

  it('does not lock when the lock is disabled', () => {
    useAppLock.setState({ enabled: false });
    listener('background');
    now += 5 * 60_000;
    listener('active');
    expect(useAppLock.getState().locked).toBe(false);
  });

  it('ignores inactive without a prior background', () => {
    listener('inactive');
    now += 5 * 60_000;
    listener('active');
    expect(useAppLock.getState().locked).toBe(false);
  });

  it('removes the AppState subscription on uninstall', () => {
    uninstall();
    expect(remove).toHaveBeenCalled();
  });
});
