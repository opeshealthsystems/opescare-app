import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Allergy, Patient } from '../api/types';

/**
 * The opt-in "Medical ID" shown on the sign-in screen and the app-lock cover.
 *
 * WHY IT EXISTS: a first responder holding an unconscious patient's phone
 * cannot sign in. If — and only if — the patient switched this on in Settings,
 * a minimal snapshot of their own profile is kept on the device and shown
 * without a session.
 *
 * RULES
 *   - Off by default. Turning it off deletes the snapshot.
 *   - Built only from data the app already fetched for the signed-in patient;
 *     a missing field stays missing, nothing is ever invented.
 *   - It deliberately SURVIVES sign-out (`wipeSessionData` never touches it).
 *   - It is cleared on account deletion, and when a DIFFERENT patient signs in
 *     on this phone (that patient never opted in, so the switch goes off too).
 *   - Age is never stored; the date of birth is, and age is computed at render.
 */

export interface EmergencyAllergy {
  name: string;
  severity: string | null;
}

export interface EmergencyContactSnapshot {
  name: string;
  relationship: string | null;
  phone: string | null;
}

export interface EmergencySnapshot {
  healthId: string;
  bloodGroup: string | null;
  dob: string | null;
  allergies: EmergencyAllergy[] | null;
  contact: EmergencyContactSnapshot | null;
  savedAt: string;
}

export interface KeyValueStorage {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

export const EMERGENCY_ENABLED_KEY = 'opescare_emergency_card_enabled';
export const EMERGENCY_SNAPSHOT_KEY = 'opescare_emergency_card';

/** Allergy statuses that no longer describe the patient. */
const INACTIVE_ALLERGY = new Set(['resolved', 'inactive', 'refuted', 'entered-in-error', 'entered_in_error']);

const clean = (v: string | null | undefined): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

/** Pure: the snapshot this patient's own data supports, or null when there is no Health ID. */
export function buildSnapshot(
  patient: Pick<Patient, 'health_id' | 'blood_group' | 'dob' | 'emergency_contact'>,
  allergies: Allergy[] | null | undefined,
  previous: EmergencySnapshot | null,
  now: Date = new Date(),
): EmergencySnapshot | null {
  const healthId = clean(patient.health_id);
  if (!healthId) return null;

  let list: EmergencyAllergy[] | null;
  if (allergies) {
    list = allergies
      .filter((a) => !INACTIVE_ALLERGY.has(String(a.status ?? '').toLowerCase()))
      .map((a) => ({ name: clean(a.substance), severity: clean(a.severity) }))
      .filter((a): a is EmergencyAllergy => a.name !== null);
  } else {
    // Allergies not (re)fetched this time — keep what we last knew for the same patient.
    list = previous && previous.healthId === healthId ? previous.allergies : null;
  }

  const ec = patient.emergency_contact;
  const contactName = clean(ec?.name);
  const contact: EmergencyContactSnapshot | null = contactName
    ? { name: contactName, relationship: clean(ec?.relationship), phone: clean(ec?.phone) }
    : null;

  return {
    healthId,
    bloodGroup: clean(patient.blood_group),
    dob: clean(patient.dob),
    allergies: list,
    contact,
    savedAt: now.toISOString(),
  };
}

/** Whole years between a YYYY-MM-DD date of birth and `now`; null if unusable. */
export function ageFromDob(dob: string | null | undefined, now: Date = new Date()): number | null {
  const m = typeof dob === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(dob) : null;
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

type Listener = (snapshot: EmergencySnapshot | null, enabled: boolean) => void;

export function createEmergencyStore(storage: KeyValueStorage) {
  const listeners = new Set<Listener>();

  const isEnabled = async (): Promise<boolean> => {
    try {
      return (await storage.get(EMERGENCY_ENABLED_KEY)) === '1';
    } catch {
      return false;
    }
  };

  const read = async (): Promise<EmergencySnapshot | null> => {
    try {
      const raw = await storage.get(EMERGENCY_SNAPSHOT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as EmergencySnapshot;
      return parsed && typeof parsed.healthId === 'string' ? parsed : null;
    } catch {
      return null;
    }
  };

  const emit = async () => {
    const [snap, on] = await Promise.all([read(), isEnabled()]);
    listeners.forEach((l) => l(on ? snap : null, on));
  };

  const clear = async (): Promise<void> => {
    await storage.remove(EMERGENCY_SNAPSHOT_KEY).catch(() => undefined);
    await emit();
  };

  const setEnabled = async (on: boolean): Promise<void> => {
    if (on) {
      await storage.set(EMERGENCY_ENABLED_KEY, '1');
    } else {
      await storage.remove(EMERGENCY_ENABLED_KEY).catch(() => undefined);
      await storage.remove(EMERGENCY_SNAPSHOT_KEY).catch(() => undefined);
    }
    await emit();
  };

  /**
   * Re-save from freshly fetched profile data. No-op when the switch is off.
   * A different patient than the stored one clears the card and turns it off.
   */
  const refresh = async (
    patient: Pick<Patient, 'health_id' | 'blood_group' | 'dob' | 'emergency_contact'> | null | undefined,
    allergies?: Allergy[] | null,
  ): Promise<EmergencySnapshot | null> => {
    if (!patient) return null;
    if (!(await isEnabled())) return null;
    const previous = await read();
    if (previous && previous.healthId !== clean(patient.health_id)) {
      await setEnabled(false);
      return null;
    }
    const next = buildSnapshot(patient, allergies, previous);
    if (!next) return null;
    await storage.set(EMERGENCY_SNAPSHOT_KEY, JSON.stringify(next));
    await emit();
    return next;
  };

  /** Account deleted: the card, and the switch, go. */
  const forget = async (): Promise<void> => setEnabled(false);

  /** The card to show without a session: only when switched on. */
  const visible = async (): Promise<EmergencySnapshot | null> => ((await isEnabled()) ? read() : null);

  const subscribe = (l: Listener): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };

  return { isEnabled, setEnabled, read, refresh, clear, forget, visible, subscribe };
}

const deviceStorage: KeyValueStorage =
  Platform.OS === 'web'
    ? {
        get: async (k) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null),
        set: async (k, v) => {
          if (typeof localStorage !== 'undefined') localStorage.setItem(k, v);
        },
        remove: async (k) => {
          if (typeof localStorage !== 'undefined') localStorage.removeItem(k);
        },
      }
    : {
        get: (k) => SecureStore.getItemAsync(k),
        set: (k, v) => SecureStore.setItemAsync(k, v),
        remove: (k) => SecureStore.deleteItemAsync(k),
      };

export const emergencyCard = createEmergencyStore(deviceStorage);
