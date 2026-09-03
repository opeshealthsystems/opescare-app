/**
 * OpesCare Mobile API endpoints — mirrors apps/mobile-patient/lib/core/api/api_endpoints.dart
 * 1:1, since Expo talks to the exact same live /mobile/* surface as the Flutter app.
 * Base URL is overridable via EXPO_PUBLIC_API_BASE_URL; defaults to the live
 * staging/production host confirmed reachable during development.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://opescare.cloud/api';

export const endpoints = {
  loginEmail: '/mobile/auth/login-email',
  loginPhone: '/mobile/auth/login',
  register: '/mobile/auth/register',
  verifyOtp: '/mobile/auth/otp/verify',
  resendOtp: '/mobile/auth/otp/resend',
  refresh: '/mobile/auth/refresh',
  appConfig: '/mobile/app-config',

  // Forgot / reset password — app/(auth)/forgot-password.tsx. Public, pre-auth
  // (see routes/mobile_password_reset.php on the backend).
  forgotPassword: '/mobile/auth/forgot-password',
  resetPassword: '/mobile/auth/reset-password',

  me: '/mobile/me',
  timeline: '/mobile/timeline',
  healthIdCard: '/mobile/health-id-card',
  generateTemporaryQr: '/mobile/qr/temporary',
  allergies: '/mobile/allergies',
  clinical: '/mobile/clinical',
  immunizations: '/mobile/immunizations',

  labs: '/mobile/labs',
  lab: (id: string) => `/mobile/labs/${id}`,

  prescriptions: '/mobile/prescriptions',
  prescription: (id: string) => `/mobile/prescriptions/${id}`,

  appointments: '/mobile/appointments',
  appointment: (id: string) => `/mobile/appointments/${id}`,
  cancelAppointment: (id: string) => `/mobile/appointments/${id}/cancel`,

  facilities: '/mobile/facilities',
  facility: (id: string) => `/mobile/facilities/${id}`,
  facilitySlots: (id: string) => `/mobile/facilities/${id}/slots`,

  documents: '/mobile/documents',
  document: (id: string) => `/mobile/documents/${id}`,

  settings: '/mobile/settings',
  pushTokens: '/mobile/push-tokens',
  pushToken: (id: string) => `/mobile/push-tokens/${id}`,

  carePlans: '/mobile/care-plans',
  carePlan: (id: string) => `/mobile/care-plans/${id}`,

  surveys: '/mobile/surveys',
  survey: (id: string) => `/mobile/surveys/${id}`,
  submitSurvey: (id: string) => `/mobile/surveys/${id}/submit`,

  exportRecordsPdf: '/mobile/medical-records/export/pdf',
  exportRecordsFhir: '/mobile/medical-records/export/fhir',

  referrals: '/mobile/referrals',

  insurance: '/mobile/insurance',

  family: '/mobile/family',
  familyInvitations: '/mobile/family/invitations',
  familyMember: (id: string) => `/mobile/family/members/${id}`,
  familyInvitation: (id: string) => `/mobile/family/invitations/${id}`,

  consentRequests: '/mobile/consent-requests',
  approveConsent: (id: string) => `/mobile/consent-requests/${id}/approve`,
  denyConsent: (id: string) => `/mobile/consent-requests/${id}/deny`,
  revokeConsent: (id: string) => `/mobile/consents/${id}/revoke`,
  accessLogs: '/mobile/access-logs',

  dataExportRequests: '/mobile/data-export-requests',
  downloadDataExport: (id: string) => `/mobile/data-exports/${id}/download`,
  correctionRequests: '/mobile/correction-requests',

  notifications: '/mobile/notifications',
  notificationUnreadCount: '/mobile/notifications/unread-count',
  markNotificationRead: (id: string) => `/mobile/notifications/${id}/read`,
  markAllNotificationsRead: '/mobile/notifications/mark-all-read',

  // Messaging — patient-facing entry point (see routes/mobile_telehealth.php).
  messageThreads: '/mobile/messages/threads',
  messageThread: (id: string | number) => `/mobile/messages/threads/${id}`,
  sendThreadMessage: (id: string | number) => `/mobile/messages/threads/${id}/messages`,

  // Pharmacy / Medicine Finder (design spec §6, Phase 2) — served by
  // App\Http\Controllers\Api\Mobile\MobilePharmacyController.
  pharmacyCategories: '/mobile/pharmacy/categories',
  medicineSearch: '/mobile/pharmacy/medicines',
  medicine: (id: string) => `/mobile/pharmacy/medicines/${id}`,
  pharmacyNearby: '/mobile/pharmacy/nearby',
  medicineReservations: '/mobile/pharmacy/reservations',
  cancelMedicineReservation: (id: string) => `/mobile/pharmacy/reservations/${id}/cancel`,

  // Help & Support — patient-facing entry point (see routes/mobile_support.php,
  // App\Http\Controllers\Api\Mobile\MobileSupportController).
  supportContact: '/mobile/support/contact',
  supportTickets: '/mobile/support/tickets',
  supportTicket: (id: string) => `/mobile/support/tickets/${id}`,
  supportTicketMessages: (id: string) => `/mobile/support/tickets/${id}/messages`,

  // Blood Finder — patient-facing entry point (see routes/mobile_blood.php,
  // App\Http\Controllers\Api\Mobile\MobileBloodController). Distinct from the
  // public /v1/care-map/blood/search directory endpoint, which is a different
  // audience and carries no patient requests.
  bloodOptions: '/mobile/blood/options',
  bloodSearch: '/mobile/blood/search',
  bloodRequests: '/mobile/blood/requests',
  cancelBloodRequest: (id: string) => `/mobile/blood/requests/${id}/cancel`,

  // Clinician / specialist directory — served by
  // App\Http\Controllers\Api\Mobile\MobileProviderController (see
  // routes/mobile_providers.php). `facilityProviders` takes a care_facilities
  // id (the directory id the patient browses, same as `facility`/`facilitySlots`);
  // `provider` takes a users.id — the exact value carried on a slot's provider_id.
  facilityProviders: (id: string) => `/mobile/facilities/${id}/providers`,
  provider: (id: string) => `/mobile/providers/${id}`,

  // Limited encrypted offline mode — served by
  // App\Http\Controllers\Api\Mobile\OfflineSyncController (see routes/api.php,
  // "Limited encrypted offline mode"). `offlinePolicies` registers a
  // scope-limited local cache policy for this device;
  // `offlinePolicyQueue` hands locally-made changes to
  // App\Modules\Offline\Services\SyncService for later reconciliation.
  offlinePolicies: '/mobile/offline/policies',
  offlinePolicyQueue: (policyId: string) => `/mobile/offline/policies/${policyId}/queue`,
} as const;
