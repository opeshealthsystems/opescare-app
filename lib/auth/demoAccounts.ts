/**
 * Demo sign-in accounts. Kept out of app/(auth)/login.tsx so that a release
 * build — where the demo gate is a build-time constant false — never bundles
 * these credentials. Only `require`d behind that gate.
 */
import type { IconName } from '@/components/opes-ui';

/**
 * The demo clinician's credentials.
 *
 * Overridable at export time so a deployment can point the demo at whichever
 * clinician its seeder actually created, without a code change. The default
 * follows the Finder demo convention (`demo.<role>@opescare.test` / `demo1234`).
 */
const DEMO_CLINICIAN_EMAIL =
  process.env.EXPO_PUBLIC_DEMO_CLINICIAN_EMAIL ?? 'demo.doctor@opescare.test';
const DEMO_CLINICIAN_PASSWORD = process.env.EXPO_PUBLIC_DEMO_CLINICIAN_PASSWORD ?? 'demo1234';

/** One-tap demo sign-in. Shown when the build is a demo build (or in dev):
 * this app is deployed as a public demo, where a visitor has no credentials
 * and an empty login screen is a dead end.
 *
 * The clinician entry is a REAL sign-in: it posts the demo clinician's
 * credentials to `/mobile/auth/provider/login`, and when that succeeds the
 * session is an actual provider token with actual clinician data behind it.
 * Only when the server serves no provider auth AT ALL does it fall back to the
 * old behaviour — the demo patient session plus the clinician UI preview — and
 * the notice under the menu then says exactly that. A server that HAS the
 * endpoint and refuses these credentials is reported, never papered over. */
export const DEMO_ACCOUNTS = [
  {
    key: 'patient',
    icon: 'person',
    labelKey: 'auth.demoLoginPatient',
    email: 'demo.patient@opescare.test',
    password: 'demo1234',
    clinician: false,
  },
  {
    // A second patient with a verified identity and the full clinical story
    // (DemoPatientStorySeeder), so a reviewer sees every state of the Health
    // ID card and every screen populated without typing anything.
    key: 'reviewer',
    icon: 'shield-check',
    labelKey: 'auth.demoLoginReviewer',
    email: 'demo.reviewer@opescare.test',
    password: 'demo1234',
    clinician: false,
  },
  // Children: the boy and girl anatomical holograms on a real credential.
  { key: 'boy', icon: 'baby', labelKey: 'auth.demoLoginBoy', email: 'demo.boy@opescare.test', password: 'demo1234', clinician: false },
  { key: 'girl', icon: 'baby', labelKey: 'auth.demoLoginGirl', email: 'demo.girl@opescare.test', password: 'demo1234', clinician: false },
  // Family: the guardian who holds both children's links (full access), and
  // the older person whose son sees her record read-only — the two sides of
  // app/family. Seeded by the backend's DemoFamilySeeder.
  { key: 'guardian', icon: 'users', labelKey: 'auth.demoLoginGuardian', email: 'demo.guardian@opescare.test', password: 'demo1234', clinician: false },
  { key: 'grandmother', icon: 'person', labelKey: 'auth.demoLoginGrandmother', email: 'demo.grandmother@opescare.test', password: 'demo1234', clinician: false },
  {
    key: 'doctor',
    icon: 'stethoscope',
    labelKey: 'auth.demoLoginDoctor',
    email: DEMO_CLINICIAN_EMAIL,
    password: DEMO_CLINICIAN_PASSWORD,
    clinician: true,
  },
  // The other staff the Finder seeds. Same real provider sign-in as the
  // doctor; the clinician area adapts (no prescribing for non-prescribers).
  { key: 'nurse', icon: 'activity', labelKey: 'auth.demoLoginNurse', email: 'demo.nurse@opescare.test', password: 'demo1234', clinician: true },
  { key: 'pharmacist', icon: 'pill', labelKey: 'auth.demoLoginPharmacist', email: 'demo.pharmacist@opescare.test', password: 'demo1234', clinician: true },
  { key: 'labtech', icon: 'flask', labelKey: 'auth.demoLoginLabtech', email: 'demo.labtech@opescare.test', password: 'demo1234', clinician: true },
  { key: 'receptionist', icon: 'clipboard', labelKey: 'auth.demoLoginReceptionist', email: 'demo.receptionist@opescare.test', password: 'demo1234', clinician: true },
] as const satisfies readonly {
  key: string;
  icon: IconName;
  labelKey: string;
  email: string | null;
  password: string | null;
  clinician: boolean;
}[];

export type DemoAccount = (typeof DEMO_ACCOUNTS)[number];
