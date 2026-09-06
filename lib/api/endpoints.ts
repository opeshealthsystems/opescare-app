/**
 * OpesCare Mobile API endpoints — mirrors apps/mobile-patient/lib/core/api/api_endpoints.dart
 * 1:1, since Expo talks to the exact same live /mobile/* surface as the Flutter app.
 * Base URL is overridable via EXPO_PUBLIC_API_BASE_URL; defaults to the live
 * staging/production host confirmed reachable during development.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://finder.opescare.cloud/api';

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
  /** POST multipart `photo` to set, DELETE to remove. */
  mePhoto: '/mobile/me/photo',
  timeline: '/mobile/timeline',
  healthIdCard: '/mobile/health-id-card',
  generateTemporaryQr: '/mobile/qr/temporary',
  allergies: '/mobile/allergies',
  clinical: '/mobile/clinical',
  immunizations: '/mobile/immunizations',

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

  exportRecordsPdf: '/mobile/medical-records/export/pdf',
  exportRecordsFhir: '/mobile/medical-records/export/fhir',

  referrals: '/mobile/referrals',

  // Family / dependents — App\Http\Controllers\Api\Mobile\MobileFamilyController.
  // `familyMember` takes a family_links.id. A dependent's RECORDS are read
  // through the ordinary endpoints above with the X-OpesCare-Dependent header
  // (lib/api/familyQueries.ts `dependentHeaders`), never a different path.
  family: '/mobile/family',
  familyInvitations: '/mobile/family/invitations',
  familyMember: (id: string) => `/mobile/family/members/${encodeURIComponent(id)}`,
  familyInvitation: (id: string) => `/mobile/family/invitations/${encodeURIComponent(id)}`,
  familyIncomingInvitations: '/mobile/family/invitations/incoming',
  acceptFamilyInvitation: (id: string) =>
    `/mobile/family/invitations/${encodeURIComponent(id)}/accept`,
  declineFamilyInvitation: (id: string) =>
    `/mobile/family/invitations/${encodeURIComponent(id)}/decline`,

  consentRequests: '/mobile/consent-requests',
  /** GET → `{ data: { pending } }` — polled by components/consent/ConsentPromptWatcher.tsx. */
  consentPendingCount: '/mobile/consent-requests/pending-count',
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

  // Messaging — patient-facing entry point (secure patient/provider threads).
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

  // Pharmacy DESK — the PHARMACIST'S side of `/mobile/pharmacy-desk`, behind a
  // provider token (`auth.provider` + `capability:dispense`; the two stock
  // routes `capability:pharmacy_stock`). Distinct audience from the patient
  // finder paths above (`medicineSearch`, `medicineReservations`…), which are
  // patient-token routes. Coded against the "Pharmacy desk" contract in the
  // role-dashboards plan; the data layer is `lib/api/pharmacyDeskQueries.ts`.
  // There is deliberately NO single-item GET here — the contract has none; a
  // detail screen is derived from the queue it came from.
  pharmacyDesk: {
    /** GET → `{ data: { facility, counts } }`. */
    home: '/mobile/pharmacy-desk/home',
    /** GET `?status=incoming|preparing|ready|dispensed` — routed to THIS facility. */
    prescriptions: '/mobile/pharmacy-desk/prescriptions',
    /** GET `?health_id=` (EXACT) — this patient's active prescriptions dispensable here. */
    prescriptionLookup: '/mobile/pharmacy-desk/prescriptions/lookup',
    /** POST. */
    acceptPrescription: (id: string) =>
      `/mobile/pharmacy-desk/prescriptions/${encodeURIComponent(id)}/accept`,
    /** POST. */
    readyPrescription: (id: string) =>
      `/mobile/pharmacy-desk/prescriptions/${encodeURIComponent(id)}/ready`,
    /** POST `{ items: [{ id, quantity_dispensed? }], notes? }`. */
    dispensePrescription: (id: string) =>
      `/mobile/pharmacy-desk/prescriptions/${encodeURIComponent(id)}/dispense`,
    /** GET `?status=pending|accepted|ready|collected|dispatched|delivered|cancelled`. */
    reservations: '/mobile/pharmacy-desk/reservations',
    /** POST — `action` is one of accept · ready · collected · dispatch · delivered · cancel. */
    reservationAction: (id: string, action: string) =>
      `/mobile/pharmacy-desk/reservations/${encodeURIComponent(id)}/${action}`,
    /** GET `?q=&low=1`. */
    stock: '/mobile/pharmacy-desk/stock',
    /** POST `{ delta, reason }` — writes a StockMovement. */
    adjustStock: (id: string) => `/mobile/pharmacy-desk/stock/${encodeURIComponent(id)}/adjust`,
  },

  // Lab DESK — the LAB TECHNICIAN'S side, behind a provider token
  // (`auth.provider` + `capability:lab_results`; `/collect` additionally admits
  // `sample_collection`). Distinct audience from the patient `/mobile/labs/*`
  // paths in `lib/api/labsQueries.ts`, which are patient-token routes. Coded
  // against the "Lab desk" contract in the role-dashboards plan; the data
  // layer is `lib/api/labDeskQueries.ts`. Every list is scoped to the token's
  // facility by the server — nothing here names a facility.
  labDesk: {
    /** GET → `{ data: { facility, counts } }`. */
    home: '/mobile/lab/home',
    /** GET `?status=ordered|collected|in_progress|resulted&urgency=` — THIS facility. */
    orders: '/mobile/lab/orders',
    /** GET → the order + `results[]` + `reference_ranges[]`. */
    order: (id: string) => `/mobile/lab/orders/${encodeURIComponent(id)}`,
    /** POST → status `collected`. */
    collectOrder: (id: string) => `/mobile/lab/orders/${encodeURIComponent(id)}/collect`,
    /** POST `{ results: [{ parameter_name, value, unit?, reference_range?, flag?, loinc_code?, notes? }] }` → status `in_progress`. */
    orderResults: (id: string) => `/mobile/lab/orders/${encodeURIComponent(id)}/results`,
    /** POST → status `resulted`; notifies the patient and the ordering clinician. 409 once released. */
    releaseOrder: (id: string) => `/mobile/lab/orders/${encodeURIComponent(id)}/release`,
    /** GET — patient test requests submitted to THIS facility. */
    requests: '/mobile/lab/requests',
    /** POST — creates the LabOrder. */
    approveRequest: (id: string) => `/mobile/lab/requests/${encodeURIComponent(id)}/approve`,
    /** POST `{ reason }`. */
    declineRequest: (id: string) => `/mobile/lab/requests/${encodeURIComponent(id)}/decline`,
  },

  // Front DESK — the RECEPTIONIST'S side, behind a provider token
  // (`auth.provider` + `capability:front_desk`). The facility-wide appointment
  // book: confirm, check in (opens the visit), route to a clinician, move,
  // cancel, no-show; book by EXACT Health ID; register a walk-in patient.
  // Coded against the "Front desk" contract in the role-dashboards plan; the
  // data layer is `lib/api/deskQueries.ts`. There is deliberately NO
  // single-item GET here — the contract has none; the detail screen is derived
  // from the day list it came from.
  desk: {
    /** GET → `{ data: { facility, counts: { today_total, awaiting_confirmation, checked_in, no_show, cancelled } } }`. */
    home: '/mobile/desk/home',
    /** GET `?date=YYYY-MM-DD&status=&provider_id=` — the whole facility's book. POST `{ health_id, scheduled_at, appointment_type, provider_id?, reason? }` books one. */
    appointments: '/mobile/desk/appointments',
    /** GET → `{ data: [{ id, name, role }] }` — clinicians posted at THIS facility. */
    providers: '/mobile/desk/providers',
    /** PUT `{ scheduled_at }` — moves the appointment outright. */
    appointment: (id: string) => `/mobile/desk/appointments/${encodeURIComponent(id)}`,
    /** PATCH `{ provider_id }` — assigns a clinician. */
    routeAppointment: (id: string) => `/mobile/desk/appointments/${encodeURIComponent(id)}/route`,
    /** POST. */
    confirmAppointment: (id: string) => `/mobile/desk/appointments/${encodeURIComponent(id)}/confirm`,
    /** POST — opens the visit at this facility under the signed-in receptionist. */
    checkInAppointment: (id: string) => `/mobile/desk/appointments/${encodeURIComponent(id)}/check-in`,
    /** POST. */
    noShowAppointment: (id: string) => `/mobile/desk/appointments/${encodeURIComponent(id)}/no-show`,
    /** POST `{ reason }` — the reason is required. */
    cancelAppointment: (id: string) => `/mobile/desk/appointments/${encodeURIComponent(id)}/cancel`,
    /** POST `{ first_name, last_name, date_of_birth, sex, phone? }` → 201 `{ data: ProviderPatientSummary }`; 409 `duplicate_identity` on a match. */
    patients: '/mobile/desk/patients',
  },
} as const;
