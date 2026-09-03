import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  Allergy,
  AllergiesResponse,
  ClinicalCondition,
  ClinicalResponse,
  HealthIdCard,
  PaginatedAppointments,
  Patient,
} from '../api/types';
import { writeScopeEntry } from './cache';
import { ensureActivePolicy, type StoredOfflinePolicy } from './policy';
import type { OfflineScope } from './scopes';

/**
 * Pulls every granted scope down and writes it into the encrypted local cache.
 *
 * Deliberately fetch-then-store rather than store-what-the-user-happened-to-
 * open: opting in has to leave the device genuinely usable offline, not merely
 * ready to remember whatever gets browsed next. Passive caching of ordinary
 * browsing is layered on top of this by ./queryPersistence.
 *
 * Results are written under the *exact* queryKeys the existing screens use
 * (lib/api/queries.ts), so replaying the cache into the query client makes
 * those screens render saved data with no changes to them.
 */

/** The composite the mobile API has no single endpoint for: what a responder
 * needs at a glance, assembled from /me, /allergies and /clinical. */
export interface OfflineEmergencyProfile {
  health_id: string | null;
  display_name: string | null;
  dob: string | null;
  sex: string | null;
  blood_group: string | null;
  allergies: Allergy[];
  conditions: ClinicalCondition[];
  captured_at: string;
}

export const EMERGENCY_PROFILE_QUERY_KEY = ['offline', 'emergency-profile'] as const;

export interface ScopeSyncOutcome {
  scope: OfflineScope;
  ok: boolean;
  error?: string;
}

export interface SyncSummary {
  syncedAt: string;
  policy: StoredOfflinePolicy;
  outcomes: ScopeSyncOutcome[];
}

/** Fetches each shared resource at most once per sync run. */
function createFetchOnce() {
  const inFlight = new Map<string, Promise<unknown>>();
  return function once<T>(key: string, run: () => Promise<T>): Promise<T> {
    if (!inFlight.has(key)) inFlight.set(key, run());
    return inFlight.get(key) as Promise<T>;
  };
}

const errorMessage = (error: unknown): string =>
  (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data
    ?.message ??
  (error as Error)?.message ??
  'unknown';

/**
 * Refreshes the local cache for every scope on the active policy.
 *
 * Renews the policy first when it has lapsed (they last 24h, or 6h in
 * emergency mode), so a stale device re-authorizes rather than silently
 * hoarding data the server no longer sanctions.
 */
export async function syncOfflineCache(queryClient?: QueryClient): Promise<SyncSummary> {
  const policy = await ensureActivePolicy();
  const once = createFetchOnce();

  const seed = async (scope: OfflineScope, key: readonly unknown[], data: unknown) => {
    await writeScopeEntry(scope, key, data);
    queryClient?.setQueryData([...key], data);
  };

  const getMe = () => once('me', async () => (await apiClient.get<Patient>(endpoints.me)).data);
  const getAllergies = () =>
    once('allergies', async () => (await apiClient.get<AllergiesResponse>(endpoints.allergies)).data);
  const getClinical = () =>
    once('clinical', async () => (await apiClient.get<ClinicalResponse>(endpoints.clinical)).data);

  const runners: Record<OfflineScope, () => Promise<void>> = {
    demographics: async () => {
      await seed('demographics', ['me'], await getMe());
      // The Health ID card is the patient's identity document — cached with
      // demographics so the ID tab still renders something useful offline.
      try {
        const card = (await apiClient.get<HealthIdCard>(endpoints.healthIdCard)).data;
        await seed('demographics', ['health-id-card'], card);
      } catch {
        // Non-fatal: /me alone still satisfies the demographics scope.
      }
    },

    appointments: async () => {
      const upcoming = (
        await apiClient.get<PaginatedAppointments>(endpoints.appointments, {
          params: { scope: 'upcoming', limit: 3 },
        })
      ).data;
      // Matches useUpcomingAppointments()'s key — the home screen's preview.
      await seed('appointments', ['appointments', 'upcoming'], upcoming);

      const list = (
        await apiClient.get<PaginatedAppointments>(endpoints.appointments, {
          params: { scope: 'upcoming', limit: 20 },
        })
      ).data;
      // Matches useAppointmentsList('upcoming', 20) — the appointments screen.
      await seed('appointments', ['appointments', 'list', 'upcoming', 20], list);
    },

    medications: async () => {
      const prescriptions = (await apiClient.get<unknown>(endpoints.prescriptions)).data;
      // Matches usePrescriptions() with no status filter.
      await seed('medications', ['prescriptions', 'all'], prescriptions);
    },

    allergies: async () => {
      await seed('allergies', ['allergies'], await getAllergies());
    },

    emergency_profile: async () => {
      const [me, allergies, clinical] = await Promise.all([
        getMe().catch(() => null),
        getAllergies().catch(() => null),
        getClinical().catch(() => null),
      ]);

      if (!me && !allergies && !clinical) throw new Error('EMERGENCY_PROFILE_UNAVAILABLE');

      const profile: OfflineEmergencyProfile = {
        health_id: me?.health_id ?? null,
        display_name: me?.display_name ?? null,
        dob: me?.dob ?? null,
        sex: me?.sex ?? null,
        blood_group: me?.blood_group ?? allergies?.blood_group ?? null,
        allergies: allergies?.allergies ?? [],
        conditions: clinical?.conditions ?? [],
        captured_at: new Date().toISOString(),
      };

      await seed('emergency_profile', EMERGENCY_PROFILE_QUERY_KEY, profile);
      if (clinical) await seed('emergency_profile', ['clinical'], clinical);
    },
  };

  const outcomes: ScopeSyncOutcome[] = [];
  for (const scope of policy.allowed_scopes) {
    try {
      await runners[scope]();
      outcomes.push({ scope, ok: true });
    } catch (error) {
      // One failing scope must not abandon the rest — a patient with no
      // prescriptions on file should still get their allergies cached.
      outcomes.push({ scope, ok: false, error: errorMessage(error) });
    }
  }

  return { syncedAt: new Date().toISOString(), policy, outcomes };
}
