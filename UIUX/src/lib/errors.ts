/**
 * Patient-facing failure copy.
 *
 * Every screen used to render `(e as Error).message` straight onto the page,
 * so a patient on a slow connection was shown `timeout of 15000ms exceeded`
 * or `Network Error`. Those strings are written for developers reading a
 * console, not for someone holding their medical record on a phone.
 *
 * This module is the single place that turns a thrown value into something a
 * patient can read and act on. Nothing here invents reassurance: when the app
 * genuinely does not know whether a write reached the clinic, it says so.
 */
import axios from 'axios';
import { NotLinkedError, PortalConflictError, ValidationError, extractErrorMessage } from '../api';
import { getLocale, translator } from '../i18n';

/**
 * `t` for a module that is not a React component.
 *
 * The locale is read at CALL time, never captured at import time: a module-level
 * `const t = translator(getLocale())` would freeze whatever language the app
 * happened to start in and keep serving it after the patient switches. This is
 * the same shape `src/screens/doctor/shared.tsx` and `chartRoutes.ts` use.
 */
const tr = () => translator(getLocale());

/** How a failure should be talked about. */
export type FailureKind =
  | 'offline'
  | 'timeout'
  | 'server'
  | 'notFound'
  | 'permission'
  | 'session'
  | 'conflict'
  | 'validation'
  | 'notLinked'
  | 'unknown';

export type Failure = {
  kind: FailureKind;
  /** Short heading, sentence case, no trailing full stop. */
  title: string;
  /** One or two sentences the patient can act on. */
  message: string;
  /**
   * True when the request left the phone but no answer came back, so the app
   * cannot tell whether the clinic recorded it. Only meaningful for writes.
   */
  outcomeUnknown: boolean;
};

// Each canned failure is built on demand rather than frozen into a module
// constant, so it is rendered in the locale that is active when the failure
// actually happens — not the one the app booted in.
const OFFLINE = (): Failure => ({
  kind: 'offline',
  title: tr()('errors.offlineTitle'),
  message: tr()('errors.offlineBody'),
  outcomeUnknown: false,
});

const TIMEOUT = (): Failure => ({
  kind: 'timeout',
  title: tr()('errors.timeoutTitle'),
  message: tr()('errors.timeoutBody'),
  outcomeUnknown: true,
});

const SERVER = (): Failure => ({
  kind: 'server',
  title: tr()('errors.serverTitle'),
  message: tr()('errors.serverBody'),
  outcomeUnknown: true,
});

const NOT_FOUND = (): Failure => ({
  kind: 'notFound',
  title: tr()('errors.notFoundTitle'),
  message: tr()('errors.notFoundBody'),
  outcomeUnknown: false,
});

const PERMISSION = (): Failure => ({
  kind: 'permission',
  title: tr()('errors.permissionTitle'),
  message: tr()('errors.permissionBody'),
  outcomeUnknown: false,
});

const SESSION = (): Failure => ({
  kind: 'session',
  title: tr()('errors.sessionTitle'),
  message: tr()('errors.sessionBody'),
  outcomeUnknown: false,
});

const BUSY = (): Failure => ({
  kind: 'server',
  title: tr()('errors.busyTitle'),
  message: tr()('errors.busyBody'),
  outcomeUnknown: false,
});

const NOT_LINKED = (): Failure => ({
  kind: 'notLinked',
  title: tr()('errors.notLinkedTitle'),
  message: tr()('errors.notLinkedBody'),
  outcomeUnknown: false,
});

/** Classify any thrown value into something a patient can read. */
export function describeFailure(e: unknown, fallbackMessage?: string): Failure {
  const t = tr();

  if (e instanceof NotLinkedError) return NOT_LINKED();

  if (e instanceof ValidationError) {
    const first = e.violations[0]?.message;
    return {
      kind: 'validation',
      title: t('errors.validationTitle'),
      // `first` and `e.message` come from the API, already in the account's
      // language — rule 7. Only the fallback is ours to translate.
      message: first || e.message || t('errors.validationBody'),
      outcomeUnknown: false,
    };
  }

  if (e instanceof PortalConflictError) {
    return {
      kind: 'conflict',
      title: e.title || t('errors.conflictTitle'),
      message: e.message || t('errors.conflictBody'),
      outcomeUnknown: false,
    };
  }

  if (axios.isAxiosError(e)) {
    const status = e.response?.status;

    if (status === undefined) {
      // Nothing came back at all: either the request never left, or it left
      // and we stopped waiting.
      if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' || /timeout/i.test(e.message)) return TIMEOUT();
      return OFFLINE();
    }

    if (status === 401) return SESSION();
    if (status === 403) return PERMISSION();
    if (status === 404) return NOT_FOUND();
    if (status === 408) return TIMEOUT();
    if (status === 429) return BUSY();
    if (status >= 500) return SERVER();

    // A 4xx that arrived with an explanation: the API's own detail line is
    // written for patients and is more useful than anything generic.
    const detail = extractErrorMessage(e, '');
    if (detail) {
      return {
        kind: 'conflict',
        title: t('errors.conflictTitle'),
        message: detail,
        outcomeUnknown: false,
      };
    }
  }

  return {
    kind: 'unknown',
    title: t('errors.unknownTitle'),
    message: fallbackMessage || t('errors.unknownBody'),
    outcomeUnknown: false,
  };
}

/**
 * The one-line message to render.
 *
 * `fallback` is used only when the failure cannot be classified — unlike the
 * old helper, a raw library string is never returned.
 */
export function patientErrorMessage(e: unknown, fallback?: string): string {
  return describeFailure(e, fallback).message;
}

/**
 * True only when the SERVER said this token is no good — a 401, or a 403 on an
 * authentication endpoint.
 *
 * The distinction that matters: "the token was rejected" is a fact the server
 * asserted, and it must end the session. "We could not reach the server" — a
 * timeout, no signal, DNS failure, a 5xx — says nothing whatsoever about the
 * token, and must not. Conflating the two is what logged a patient out of their
 * own record every time they opened the app in a low-signal area.
 */
export function isSessionRejected(e: unknown): boolean {
  if (!axios.isAxiosError(e)) return false;
  return e.response?.status === 401;
}

/**
 * True when a write may or may not have been recorded. Screens use this to
 * stop themselves from claiming "nothing happened" when they cannot know.
 */
export function isOutcomeUnknown(e: unknown): boolean {
  return describeFailure(e).outcomeUnknown;
}

/**
 * Copy for a write that failed, told honestly.
 *
 * `checkHint` says where the patient can confirm for themselves — e.g.
 * "Open Appointments to see whether it was booked." It is required for the
 * unknown-outcome case, because "it did not happen" would be a guess.
 */
export function writeFailureMessage(e: unknown, checkHint: string, fallback?: string): string {
  const f = describeFailure(e, fallback);
  if (!f.outcomeUnknown) return f.message;
  // One key holds the whole sentence — rule 4. The uncertainty and the
  // instruction to check are part of the translated string, not glued on here.
  return tr()('errors.unknownOutcome', { message: f.message, checkHint });
}
