import { useEffect, useState } from 'react';
import type { AllergiesResponse } from '../api/types';
import { queryClient } from '../session/wipe';
import { useAuthStore } from '../store/auth';
import { emergencyCard, type EmergencySnapshot } from './snapshot';

const allergiesOf = (): AllergiesResponse | undefined =>
  queryClient.getQueryData<AllergiesResponse>(['allergies']);

/**
 * Keeps the opt-in emergency card in step with the patient's own profile:
 * every time the session profile (`fetchMe`) or the allergies query settles,
 * the snapshot is re-saved — when, and only when, the switch is on.
 * Mounted once, from the always-present AppLockGate.
 */
export function useEmergencySnapshotSync(): void {
  useEffect(() => {
    let lastPatient = useAuthStore.getState().patient;
    if (lastPatient) void emergencyCard.refresh(lastPatient, allergiesOf()?.allergies);

    const unAuth = useAuthStore.subscribe((s) => {
      if (s.patient && s.patient !== lastPatient) {
        void emergencyCard.refresh(s.patient, allergiesOf()?.allergies);
      }
      lastPatient = s.patient;
    });

    const unCache = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.query.queryKey[0] !== 'allergies') return;
      const data = event.query.state.data as AllergiesResponse | undefined;
      const patient = useAuthStore.getState().patient;
      if (data && patient && event.action.type === 'success') {
        void emergencyCard.refresh(patient, data.allergies);
      }
    });

    return () => {
      unAuth();
      unCache();
    };
  }, []);
}

/** The card to show without a session (null when off or empty). */
export function useVisibleEmergencyCard(): EmergencySnapshot | null {
  const [snap, setSnap] = useState<EmergencySnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    void emergencyCard.visible().then((s) => alive && setSnap(s));
    const un = emergencyCard.subscribe((s) => setSnap(s));
    return () => {
      alive = false;
      un();
    };
  }, []);
  return snap;
}
