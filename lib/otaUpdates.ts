/**
 * Check for a published over-the-air update and download it.
 * Resolves true only when a NEW update is now downloaded and waiting for a
 * restart; false when there is none, or when the network/update server fails
 * (the caller simply tries again on the next foreground).
 */
export interface UpdatesApi {
  checkForUpdateAsync: () => Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync: () => Promise<{ isNew?: boolean }>;
}

export async function fetchPendingUpdate(api: UpdatesApi): Promise<boolean> {
  try {
    const check = await api.checkForUpdateAsync();
    if (!check.isAvailable) return false;
    const fetched = await api.fetchUpdateAsync();
    return fetched.isNew !== false;
  } catch {
    return false;
  }
}
