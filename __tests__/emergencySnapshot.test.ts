jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('@/lib/offline/policy', () => ({
  revokeStoredPolicy: jest.fn(async () => undefined),
  clearStoredPolicy: jest.fn(async () => undefined),
}));
jest.mock('@/lib/offline/cache', () => ({ clearOfflineCache: jest.fn(async () => undefined) }));
jest.mock('@/lib/offline/outbox', () => ({ clearOutbox: jest.fn(async () => undefined) }));
jest.mock('@/lib/fileDelivery', () => ({ clearExportedFiles: jest.fn(async () => undefined) }));

import {
  EMERGENCY_ENABLED_KEY,
  EMERGENCY_SNAPSHOT_KEY,
  ageFromDob,
  buildSnapshot,
  createEmergencyStore,
  type KeyValueStorage,
} from '@/lib/emergency/snapshot';
import * as SecureStore from 'expo-secure-store';
import { wipeSessionData } from '@/lib/session/wipe';
import type { Allergy } from '@/lib/api/types';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => {
      data.set(k, v);
    },
    remove: async (k) => {
      data.delete(k);
    },
  };
}

const patientA = {
  health_id: 'OC-AAAA-1111',
  blood_group: 'O+',
  dob: '1990-05-20',
  emergency_contact: { name: 'Marie', relationship: 'Sister', phone: '+237 6 99 00 11 22' },
};
const allergy = (substance: string, severity: string | null, status = 'active'): Allergy => ({
  id: substance,
  substance,
  severity,
  status,
  recorded: null,
});

describe('emergency snapshot store', () => {
  it('saves nothing while the switch is off', async () => {
    const st = memoryStorage();
    const card = createEmergencyStore(st);
    await expect(card.refresh(patientA, [])).resolves.toBeNull();
    expect(st.data.has(EMERGENCY_SNAPSHOT_KEY)).toBe(false);
    await expect(card.visible()).resolves.toBeNull();
  });

  it('saves the patient\'s own fields when on, and refreshes them', async () => {
    const st = memoryStorage();
    const card = createEmergencyStore(st);
    await card.setEnabled(true);
    await card.refresh(patientA, [allergy('Penicillin', 'severe'), allergy('Old', null, 'resolved')]);
    let snap = await card.visible();
    expect(snap).toMatchObject({
      healthId: 'OC-AAAA-1111',
      bloodGroup: 'O+',
      dob: '1990-05-20',
      allergies: [{ name: 'Penicillin', severity: 'severe' }],
      contact: { name: 'Marie', relationship: 'Sister', phone: '+237 6 99 00 11 22' },
    });
    // Age is never stored.
    expect(JSON.stringify(snap)).not.toMatch(/"age"/);

    // A profile refetch without allergies keeps the last known list.
    await card.refresh({ ...patientA, blood_group: 'A-' });
    snap = await card.visible();
    expect(snap?.bloodGroup).toBe('A-');
    expect(snap?.allergies).toEqual([{ name: 'Penicillin', severity: 'severe' }]);
  });

  it('turning the switch off deletes the snapshot', async () => {
    const st = memoryStorage();
    const card = createEmergencyStore(st);
    await card.setEnabled(true);
    await card.refresh(patientA, []);
    await card.setEnabled(false);
    expect(st.data.has(EMERGENCY_SNAPSHOT_KEY)).toBe(false);
    expect(st.data.has(EMERGENCY_ENABLED_KEY)).toBe(false);
    await expect(card.visible()).resolves.toBeNull();
  });

  it('survives the sign-out wipe', async () => {
    const st = memoryStorage();
    const card = createEmergencyStore(st);
    await card.setEnabled(true);
    await card.refresh(patientA, []);
    await wipeSessionData();
    const removed = (SecureStore.deleteItemAsync as jest.Mock).mock.calls.map((c) => c[0]);
    expect(removed).not.toContain(EMERGENCY_SNAPSHOT_KEY);
    expect(removed).not.toContain(EMERGENCY_ENABLED_KEY);
    await expect(card.visible()).resolves.toMatchObject({ healthId: 'OC-AAAA-1111' });
  });

  it('is cleared, and switched off, when a different patient signs in', async () => {
    const st = memoryStorage();
    const card = createEmergencyStore(st);
    await card.setEnabled(true);
    await card.refresh(patientA, []);
    await expect(card.refresh({ ...patientA, health_id: 'OC-BBBB-2222' }, [])).resolves.toBeNull();
    await expect(card.isEnabled()).resolves.toBe(false);
    await expect(card.read()).resolves.toBeNull();
  });

  it('forget() (account deletion) removes everything', async () => {
    const st = memoryStorage();
    const card = createEmergencyStore(st);
    await card.setEnabled(true);
    await card.refresh(patientA, []);
    await card.forget();
    expect(st.data.size).toBe(0);
  });

  it('never invents missing fields', () => {
    const snap = buildSnapshot(
      { health_id: 'OC-X', blood_group: null, dob: null, emergency_contact: null },
      undefined,
      null,
    );
    expect(snap).toMatchObject({ bloodGroup: null, dob: null, allergies: null, contact: null });
    expect(buildSnapshot({ health_id: '', blood_group: 'O+', dob: null, emergency_contact: null }, [], null)).toBeNull();
  });

  it('computes age at render time from the date of birth', () => {
    expect(ageFromDob('1990-05-20', new Date(2026, 4, 19))).toBe(35);
    expect(ageFromDob('1990-05-20', new Date(2026, 4, 20))).toBe(36);
    expect(ageFromDob(null)).toBeNull();
    expect(ageFromDob('garbage')).toBeNull();
  });
});
