/**
 * The server's ROLE refusal — one predicate, shared by every clinician layer.
 *
 * Every `/mobile/doctor/*` route now sits behind the backend's `capability:`
 * middleware (`RequireStaffCapability`), which answers
 *
 *     403 { message, error_code: "role_forbidden", required: ["prescribe"] }
 *
 * whenever the signed-in professional's ROLE lacks the capability the route
 * needs. That is a different fact from every other 403 this app knows:
 *
 *   • the chart's `NO_CLINICAL_RELATIONSHIP` is about THIS patient, and the
 *     remedy is a consent request;
 *   • a break-glass grant that has expired is about THIS grant;
 *   • `role_forbidden` is about the ACCOUNT, and no request, retry or consent
 *     can change it. The only honest thing to say is "this is not part of
 *     your role".
 *
 * Before this predicate existed a role refusal surfaced as patient wording
 * ("This record is not shared with your account"), as "Not available on this
 * server yet" on the prescribe screen, and as an "Ask for access" button on
 * the chart — each of them a wrong claim. `describeFailure`
 * (`components/care/shared.tsx`), `doctorAccessRefusal`
 * (`lib/api/doctorQueries.ts`) and `isPrescribingUnavailable`
 * (`lib/api/prescribingQueries.ts`) all consult this first.
 *
 * Matched on status AND body, deliberately: a 403 from a proxy or a WAF
 * interstitial carries no `error_code` and must not be dressed up as a role
 * decision the server never made.
 */
import { isAxiosError } from 'axios';

/** The wire spelling of the middleware's refusal code. */
export const ROLE_FORBIDDEN_CODE = 'role_forbidden';

/** True exactly when the server refused this request for the account's ROLE. */
export function isRoleForbidden(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  if (error.response?.status !== 403) return false;
  const body = error.response?.data as { error_code?: unknown } | undefined;
  return body?.error_code === ROLE_FORBIDDEN_CODE;
}

/**
 * The capabilities the server said the route needs (`required[]`), or an empty
 * list when the failure is not a role refusal or the body did not carry them.
 * Diagnostic only — the app's own map (`lib/staffCapabilities.ts`) decides
 * what to draw; this is what the server actually asked for.
 */
export function roleForbiddenRequired(error: unknown): string[] {
  if (!isRoleForbidden(error) || !isAxiosError(error)) return [];
  const body = error.response?.data as { required?: unknown } | undefined;
  return Array.isArray(body?.required)
    ? body.required.filter((v): v is string => typeof v === 'string')
    : [];
}
