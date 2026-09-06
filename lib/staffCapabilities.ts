/**
 * Staff capabilities — the app-side MIRROR of the backend's role → capability map.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SOURCE OF TRUTH: opescare-finder/config/staff_capabilities.php            │
 * │                                                                          │
 * │ The role arrays below are copied VERBATIM from that file. The two must   │
 * │ be kept in sync — change both or neither. The server enforces the map    │
 * │ through its `capability:` middleware (403 `role_forbidden`); this file   │
 * │ only decides what the phone is worth drawing for a role, so a mismatch   │
 * │ never grants anything, it just shows a screen the server will refuse or  │
 * │ hides one it would have served.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Role names are `roles.name` values (what `ProviderAccount.role` carries) —
 * NOT `dashboard_profile_key`s. The one hand-rolled list this app used to have
 * (`PRESCRIBER_ROLES` on the Today screen) named two dashboard keys that never
 * matched and missed three doctor roles; that is exactly the drift this file
 * exists to end.
 *
 * Capabilities are coarse on purpose: they gate SURFACES ("may open the
 * prescriber desk"), not records. Record-level access is still decided by
 * consent grants, clinical relationships and facility context on the server.
 *
 * ── WHEN THERE IS NO ROLE ─────────────────────────────────────────────────
 * A REAL provider session always carries a role, and an unknown or empty role
 * fails CLOSED here — the server would refuse it anyway. The clinician
 * PREVIEW (`EXPO_PUBLIC_DOCTOR_PERSONA` / the demo preview in
 * `lib/store/auth.ts`) has no provider account at all; it exists to show the
 * UI on a host without provider auth and grants no data, so the hook leaves it
 * unrestricted rather than hiding the very screens it was built to preview.
 */
import { useAuthStore } from './store/auth';

// ── The map ───────────────────────────────────────────────────────────────

export type Capability =
  | 'identify_patient'
  | 'clinical_chart'
  | 'request_access'
  | 'prescribe'
  | 'emergency_access'
  | 'dispense'
  | 'pharmacy_stock'
  | 'lab_results'
  | 'sample_collection'
  | 'front_desk'
  | 'schedule'
  | 'messaging'
  | 'blood_inventory'
  | 'billing'
  | 'facility_team';

// The role families, in the PHP file's own grouping and order.
const doctors = ['doctor', 'multi_doctor', 'specialist', 'consultant', 'resident', 'visiting_doctor'] as const;
const nurses = ['nurse', 'triage_nurse', 'ward_nurse', 'midwife', 'nurse_supervisor'] as const;
const trainees = ['student_doctor', 'student_nurse', 'intern'] as const;
const supervisors = ['medical_supervisor'] as const;
const frontDesk = ['receptionist', 'front_desk', 'appointment_coordinator', 'queue_manager', 'records_officer'] as const;
const lab = ['labtech', 'lab_scientist', 'lab_manager', 'lab_validator'] as const;
const labCollection = ['sample_collection'] as const;
const pharmacy = ['pharmacist', 'pharmacy_technician', 'pharmacy_manager', 'dispensing_officer'] as const;
const pharmacyStock = ['medicine_stock'] as const;
const billing = ['cashier', 'billing_officer', 'finance_manager', 'finance', 'refund_approver', 'wallet_ops'] as const;
const facilityAdmins = ['facility_admin', 'clinic_admin', 'hospital_admin', 'facility_ceo', 'branch_admin'] as const;

const clinical = [...doctors, ...nurses, ...trainees, ...supervisors] as const;

/**
 * capability → the role names that hold it. Same keys, same members, same
 * order as `config/staff_capabilities.php` → `capabilities`.
 */
export const STAFF_CAPABILITIES: Record<Capability, readonly string[]> = {
  identify_patient: [...clinical, ...frontDesk, ...lab, ...labCollection, ...pharmacy, ...pharmacyStock],
  clinical_chart: clinical,
  request_access: [...clinical, ...pharmacy],
  prescribe: [...doctors, ...supervisors],
  emergency_access: [...doctors, ...nurses, ...supervisors],
  dispense: pharmacy,
  pharmacy_stock: [...pharmacy, ...pharmacyStock],
  lab_results: lab,
  sample_collection: [...lab, ...labCollection],
  front_desk: frontDesk,
  schedule: [...clinical, ...frontDesk],
  messaging: [...clinical, ...frontDesk, ...lab, ...labCollection, ...pharmacy],
  blood_inventory: [...doctors, ...nurses, ...supervisors, ...frontDesk, ...lab],
  billing: [...billing, ...frontDesk],
  facility_team: facilityAdmins,
};

/** Every role name the map knows, in family order. */
export const KNOWN_ROLES: readonly string[] = [
  ...doctors,
  ...nurses,
  ...trainees,
  ...supervisors,
  ...frontDesk,
  ...lab,
  ...labCollection,
  ...pharmacy,
  ...pharmacyStock,
  ...billing,
  ...facilityAdmins,
];

// ── Pure helpers ──────────────────────────────────────────────────────────

/** `roles.name` as the server spells it; case-folded and trimmed, never renamed. */
function normaliseRole(role: string | null | undefined): string | null {
  const value = role?.trim().toLowerCase();
  return value ? value : null;
}

/**
 * True when `role` holds ANY of `caps` (the middleware's any-of semantics).
 * No role, an empty role, or a role the map does not know → false.
 */
export function roleHas(role: string | null | undefined, ...caps: Capability[]): boolean {
  const name = normaliseRole(role);
  if (!name) return false;
  return caps.some((cap) => STAFF_CAPABILITIES[cap].includes(name));
}

/** Every capability `role` holds — empty for an unknown role. */
export function capabilitiesForRole(role: string | null | undefined): Capability[] {
  const name = normaliseRole(role);
  if (!name) return [];
  return (Object.keys(STAFF_CAPABILITIES) as Capability[]).filter((cap) =>
    STAFF_CAPABILITIES[cap].includes(name),
  );
}

/**
 * The PHP file's own grouping of a role, used only for wording ("what your
 * role is for"). `unknown` for a role the map does not name.
 */
export type RoleFamily =
  | 'doctor'
  | 'nurse'
  | 'trainee'
  | 'supervisor'
  | 'frontDesk'
  | 'lab'
  | 'labCollection'
  | 'pharmacy'
  | 'pharmacyStock'
  | 'billing'
  | 'facilityAdmin'
  | 'unknown';

export function roleFamily(role: string | null | undefined): RoleFamily {
  const name = normaliseRole(role);
  if (!name) return 'unknown';
  if ((doctors as readonly string[]).includes(name)) return 'doctor';
  if ((nurses as readonly string[]).includes(name)) return 'nurse';
  if ((trainees as readonly string[]).includes(name)) return 'trainee';
  if ((supervisors as readonly string[]).includes(name)) return 'supervisor';
  if ((frontDesk as readonly string[]).includes(name)) return 'frontDesk';
  if ((lab as readonly string[]).includes(name)) return 'lab';
  if ((labCollection as readonly string[]).includes(name)) return 'labCollection';
  if ((pharmacy as readonly string[]).includes(name)) return 'pharmacy';
  if ((pharmacyStock as readonly string[]).includes(name)) return 'pharmacyStock';
  if ((billing as readonly string[]).includes(name)) return 'billing';
  if ((facilityAdmins as readonly string[]).includes(name)) return 'facilityAdmin';
  return 'unknown';
}

/**
 * The catalogue key that names a role for people — `opesDoctor.profile.role.<role>`
 * for every role the map knows, else the neutral fallback
 * (`opesDoctor.profile.roleFallback`, "Staff"). The raw column value is never
 * the thing on screen.
 */
export function roleLabelKey(role: string | null | undefined): string {
  const name = normaliseRole(role);
  if (name && KNOWN_ROLES.includes(name)) return `opesDoctor.profile.role.${name}`;
  return 'opesDoctor.profile.roleFallback';
}

// ── Hooks ─────────────────────────────────────────────────────────────────

/** The signed-in professional's `roles.name`, or null when there is no provider session. */
export function useProviderRole(): string | null {
  return useAuthStore((s) => s.provider?.role ?? null);
}

/**
 * True when there is a REAL provider session (a verified token), as opposed
 * to the clinician preview that renders the UI with no account behind it.
 */
export function useHasProviderSession(): boolean {
  return useAuthStore((s) => s.provider !== null);
}

/**
 * Does the signed-in role hold ANY of `caps`?
 *
 * A real session is judged strictly on its role. The preview (no provider
 * account) is unrestricted — see the module note. This is a UI decision, not
 * a security boundary: the server refuses on the token regardless.
 */
export function useStaffCapability(...caps: Capability[]): boolean {
  const provider = useAuthStore((s) => s.provider);
  if (provider === null) return true;
  return roleHas(provider.role, ...caps);
}
