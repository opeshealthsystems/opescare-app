/**
 * Barrel for the OPES patient-portal API clients.
 *
 *   import { fetchDashboard, bookAppointment, type PortalAppointment } from '../api';
 *
 * `clinical.ts` (Phase 123) is intentionally NOT re-exported here: several of
 * its names — Appointment, Prescription, Invoice, fetchAppointments — collide
 * with the richer Phase 125 types below. Import it directly if you still need
 * the legacy shapes.
 */
export * from './portal';
export * from './dashboard';
export * from './scheduling';
export * from './messaging';
export * from './chatWidgets';
export * from './medications';
export * from './diagnostics';
export * from './billing';
export * from './records';
export * from './certificates';
export * from './telemedicine';
export * from './care';
export * from './staffMessaging';
export * from './doctorInbox';
export * from './enrolment';

export { apiClient, extractErrorMessage, storeToken, getStoredToken, clearStoredToken } from './client';
export type { ApiErrorBody } from './client';
export { API_BASE_URL } from './config';

export {
  register,
  login,
  logout,
  me,
  linkPatientRecord,
} from './auth';
export type { PatientAccount, RegisterInput } from './auth';
