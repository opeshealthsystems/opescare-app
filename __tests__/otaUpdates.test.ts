import { fetchPendingUpdate } from '@/lib/otaUpdates';

describe('over-the-air update check', () => {
  it('downloads and reports a new update', async () => {
    const api = { checkForUpdateAsync: jest.fn(async () => ({ isAvailable: true })), fetchUpdateAsync: jest.fn(async () => ({ isNew: true })) };
    await expect(fetchPendingUpdate(api)).resolves.toBe(true);
    expect(api.fetchUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no update is published', async () => {
    const api = { checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })), fetchUpdateAsync: jest.fn() };
    await expect(fetchPendingUpdate(api)).resolves.toBe(false);
    expect(api.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it('does not offer a restart for an update already on the phone', async () => {
    const api = { checkForUpdateAsync: jest.fn(async () => ({ isAvailable: true })), fetchUpdateAsync: jest.fn(async () => ({ isNew: false })) };
    await expect(fetchPendingUpdate(api)).resolves.toBe(false);
  });

  it('swallows offline / server errors so the app never breaks', async () => {
    const api = { checkForUpdateAsync: jest.fn(async () => { throw new Error('offline'); }), fetchUpdateAsync: jest.fn() };
    await expect(fetchPendingUpdate(api)).resolves.toBe(false);
  });
});
