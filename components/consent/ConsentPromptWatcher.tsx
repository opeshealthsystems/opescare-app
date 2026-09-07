/**
 * Watches for a clinician asking to open the patient's record, and puts the
 * question on the patient's screen.
 *
 * Mounted once, by `app/_layout.tsx`, after the Stack, so the sheet paints
 * over whatever screen the patient is on. It renders nothing unless the
 * session is an authenticated PATIENT — a clinician is never asked to approve
 * anything here — and nothing at all until there is a request to decide.
 *
 * ── How a request reaches this component ──────────────────────────────────
 *
 *  1. POLL. While the app is in the foreground (`AppState`), the pending
 *     count (`GET /mobile/consent-requests/pending-count`) is asked every
 *     20 s; in the background the interval stops. When the count rises, the
 *     pending list (`?status=pending`) is fetched and the newest request this
 *     session has not yet shown comes up. This is the path that works today
 *     on every platform, including the web build and a native build with no
 *     push credentials (`lib/push/capability.ts`).
 *
 *  2. PUSH. A `consent_request` push refreshes the same queries and raises the
 *     consent signal (`lib/push/handler.ts`), so the sheet opens within a
 *     second of the clinician tapping Send rather than at the next tick.
 *
 * ── The sound ─────────────────────────────────────────────────────────────
 *
 * Once per request, never twice: `lib/push/consentSignal.ts` records which
 * ids have already been announced by either path.
 *  - Web: the hospital chime through an `Audio` element (`lib/push/sounds.ts`).
 *    A tab the person has not interacted with may refuse autoplay; the sheet
 *    is on screen regardless.
 *  - Native: a LOCAL notification on the `consent` channel
 *    (`lib/push/local.ts`) — the OS plays the chime from the same file the
 *    push would use, and the tray gets a tappable entry. Only for a request
 *    created in the last two minutes: an older one was already pushed while
 *    the app was closed (it is in the tray), or predates this session and
 *    deserves the sheet, not a second alert.
 *
 * "Decide later" dismisses for this session only; the request stays pending on
 * the server and in Privacy & Data, and the count keeps being polled so a NEW
 * request still comes up.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useAuthStore } from '@/lib/store/auth';
import {
  type ConsentRequestItem,
  useApproveConsent,
  useConsentPendingCount,
  useConsentRequests,
  useDenyConsent,
} from '@/lib/api/queries';
import { markConsentAnnounced, onConsentRequestSignal, wasConsentAnnounced } from '@/lib/push/consentSignal';
import { startConsentAlert } from '@/lib/push/consentAlert';
import {
  ConsentPromptSheet,
  facilityNameOf,
  type ConsentPromptBusy,
  type ConsentPromptOutcome,
} from './ConsentPromptSheet';

/** How often the pending count is asked while the app is in the foreground. */
export const CONSENT_POLL_MS = 20_000;

/** A request older than this is not announced natively — see the module note. */
const FRESH_MS = 2 * 60_000;

/** The wire value today, plus the short form the `?status=` contract uses. */
const PENDING_STATUSES = new Set(['pending_patient_approval', 'pending']);

export function isPendingConsentRequest(item: ConsentRequestItem): boolean {
  return PENDING_STATUSES.has(item.status);
}

function createdAtMs(item: ConsentRequestItem): number {
  const parsed = item.created_at ? Date.parse(item.created_at) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestFirst(a: ConsentRequestItem, b: ConsentRequestItem): number {
  return createdAtMs(b) - createdAtMs(a);
}

export function ConsentPromptWatcher() {
  // A boolean selector, so this re-renders only when eligibility flips.
  const eligible = useAuthStore(
    (s) => s.status === 'authenticated' && s.persona === 'patient' && s.provider === null,
  );
  return eligible ? <ActiveWatcher /> : null;
}

function ActiveWatcher() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // ── Foreground / background ──────────────────────────────────────────────
  const [appActive, setAppActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      const active = next === 'active';
      setAppActive(active);
      // Coming back is the moment a request is most likely to be waiting.
      if (active) void queryClient.invalidateQueries({ queryKey: ['consent-requests', 'pending-count'] });
    });
    return () => subscription.remove();
  }, [queryClient]);

  // ── The poll ─────────────────────────────────────────────────────────────
  const countQuery = useConsentPendingCount({
    enabled: appActive,
    refetchInterval: appActive ? CONSENT_POLL_MS : false,
  });
  const pending = countQuery.data ?? 0;
  const listQuery = useConsentRequests('pending', { enabled: appActive && pending > 0 });

  const lastCount = useRef(0);
  useEffect(() => {
    if (pending > lastCount.current) {
      void queryClient.invalidateQueries({ queryKey: ['consent-requests', 'pending'] });
    }
    lastCount.current = pending;
  }, [pending, queryClient]);

  // A push says "now": refetch the count at once instead of waiting the interval out.
  const refetchCount = countQuery.refetch;
  useEffect(
    () =>
      onConsentRequestSignal(() => {
        void refetchCount();
      }),
    [refetchCount],
  );

  const pendingItems = useMemo(
    () => (listQuery.data ?? []).filter(isPendingConsentRequest).slice().sort(newestFirst),
    [listQuery.data],
  );

  // ── What is on screen ────────────────────────────────────────────────────
  /** Ids shown this session — decided or deferred — so nothing pops twice. */
  const shown = useRef(new Set<string>());
  const [current, setCurrent] = useState<ConsentRequestItem | null>(null);
  const [outcome, setOutcome] = useState<ConsentPromptOutcome | null>(null);
  const [busy, setBusy] = useState<ConsentPromptBusy>(null);

  /**
   * The alert currently running, so it can be silenced the instant the patient
   * answers. Somebody is asking to open their record: it sounds three times and
   * asks again, which is only tolerable because every way out of this sheet
   * calls this.
   */
  const alertStop = useRef<null | (() => void)>(null);

  const silence = useCallback(() => {
    alertStop.current?.();
    alertStop.current = null;
  }, []);

  // Leaving the screen with an alert running would keep sounding at somebody
  // who can no longer answer it.
  useEffect(() => silence, [silence]);

  const announce = useCallback(
    async (item: ConsentRequestItem) => {
      if (wasConsentAnnounced(item.id)) return;
      markConsentAnnounced(item.id);

      // An old request that surfaced on a poll is not an emergency; it is
      // history, and history must not set off an alarm.
      if (Platform.OS !== 'web' && Date.now() - createdAtMs(item) > FRESH_MS) return;

      const facility = item.requesting_facility?.name?.trim() || item.requesting_facility_name?.trim() || null;

      silence();
      alertStop.current = startConsentAlert({
        requestId: item.id,
        notification: {
          title: t('push.local.consentTitle'),
          body: facility ? t('push.local.consentBody', { facility }) : t('push.local.consentBodyNoFacility'),
          data: { type: 'consent_request', consent_request_id: item.id },
        },
      });
    },
    [silence, t],
  );

  // Bring up the newest request not yet shown — one at a time.
  useEffect(() => {
    if (current) return;
    const next = pendingItems.find((item) => !shown.current.has(item.id));
    if (!next) return;
    shown.current.add(next.id);
    setOutcome(null);
    setBusy(null);
    setCurrent(next);
    void announce(next);
  }, [pendingItems, current, announce]);

  // Decided elsewhere (the Privacy & Data hub, another device) while the sheet
  // was open and untouched: it is no longer pending, so it quietly goes away.
  useEffect(() => {
    if (!current || outcome || busy || !listQuery.data) return;
    if (!pendingItems.some((item) => item.id === current.id)) {
      // Answered on another device, or withdrawn. Stop asking.
      silence();
      setCurrent(null);
    }
  }, [current, outcome, busy, listQuery.data, pendingItems, silence]);

  const morePending = useMemo(
    () => pendingItems.filter((item) => !shown.current.has(item.id)).length,
    // `current` is read so the count refreshes after a request is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingItems, current],
  );

  // ── Decisions ────────────────────────────────────────────────────────────
  const approveMutation = useApproveConsent();
  const denyMutation = useDenyConsent();

  const decide = useCallback(
    (kind: 'approve' | 'deny') => {
      if (!current || busy) return;
      silence();
      const item = current;
      const facility = facilityNameOf(t, item);
      setBusy(kind);
      const mutation = kind === 'approve' ? approveMutation : denyMutation;
      mutation.mutate(item.id, {
        onSuccess: () =>
          setOutcome({
            kind: kind === 'approve' ? 'approved' : 'denied',
            message: t(kind === 'approve' ? 'consentPrompt.approved' : 'consentPrompt.denied', { facility }),
          }),
        // The server's message may be English; the patient's language wins,
        // and the one fact that matters is that nothing changed.
        onError: () => setOutcome({ kind: 'failed', message: t('consentPrompt.failed') }),
        onSettled: () => setBusy(null),
      });
    },
    [approveMutation, busy, current, denyMutation, silence, t],
  );

  const onApprove = useCallback(() => decide('approve'), [decide]);
  const onDeny = useCallback(() => decide('deny'), [decide]);
  const dismiss = useCallback(() => {
    silence();
    setCurrent(null);
    setOutcome(null);
    setBusy(null);
  }, [silence]);
  const onOpenInbox = useCallback(() => {
    dismiss();
    router.push('/privacy');
  }, [dismiss]);

  if (!current) return null;

  return (
    <ConsentPromptSheet
      request={current}
      morePending={morePending}
      outcome={outcome}
      busy={busy}
      onApprove={onApprove}
      onDeny={onDeny}
      onLater={dismiss}
      onClose={dismiss}
      onOpenInbox={onOpenInbox}
    />
  );
}
