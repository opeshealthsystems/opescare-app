const mockCalls: string[] = [];

jest.mock('@/lib/offline/policy', () => ({
  revokeStoredPolicy: jest.fn(async () => {
    mockCalls.push('revoke');
  }),
  clearStoredPolicy: jest.fn(async () => {
    mockCalls.push('clearPolicy');
  }),
}));
jest.mock('@/lib/offline/cache', () => ({
  clearOfflineCache: jest.fn(async () => {
    mockCalls.push('clearCache');
  }),
}));
jest.mock('@/lib/offline/outbox', () => ({
  clearOutbox: jest.fn(async () => {
    mockCalls.push('clearOutbox');
  }),
}));
jest.mock('@/lib/fileDelivery', () => ({
  clearExportedFiles: jest.fn(async () => {
    mockCalls.push('clearExports');
  }),
}));

import { clearExportedFiles } from '@/lib/fileDelivery';
import { clearOfflineCache } from '@/lib/offline/cache';
import { clearOutbox } from '@/lib/offline/outbox';
import { clearStoredPolicy, revokeStoredPolicy } from '@/lib/offline/policy';
import { queryClient, wipeSessionData } from '@/lib/session/wipe';

describe('wipeSessionData', () => {
  beforeEach(() => {
    mockCalls.length = 0;
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('clears the in-memory query cache', async () => {
    queryClient.setQueryData(['patient', 'me'], { name: 'Previous patient' });
    await wipeSessionData();
    expect(queryClient.getQueryData(['patient', 'me'])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('clears offline cache, policy, outbox and exported files', async () => {
    await wipeSessionData();
    expect(clearOfflineCache).toHaveBeenCalledTimes(1);
    expect(clearStoredPolicy).toHaveBeenCalledTimes(1);
    expect(clearOutbox).toHaveBeenCalledTimes(1);
    expect(clearExportedFiles).toHaveBeenCalledTimes(1);
  });

  it('revokes the policy server-side before clearing the stored policy', async () => {
    await wipeSessionData();
    expect(revokeStoredPolicy).toHaveBeenCalledTimes(1);
    expect(mockCalls[0]).toBe('revoke');
    expect(mockCalls.indexOf('revoke')).toBeLessThan(mockCalls.indexOf('clearPolicy'));
  });

  it('keeps wiping the other stores when one store fails', async () => {
    (clearOfflineCache as jest.Mock).mockRejectedValueOnce(new Error('keychain locked'));
    (clearOutbox as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await expect(wipeSessionData()).resolves.toBeUndefined();
    expect(clearStoredPolicy).toHaveBeenCalled();
    expect(clearExportedFiles).toHaveBeenCalled();
  });
});
