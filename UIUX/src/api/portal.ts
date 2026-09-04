/**
 * Shared plumbing for the Phase 125 patient-portal clients.
 *
 * Every portal endpoint speaks the same envelope — `{ data, meta, errors }` —
 * and every one of them answers 409 when the account is not yet linked to a
 * clinical record. These helpers normalise both so the domain clients below
 * (scheduling, messaging, medications, diagnostics, billing, records) stay
 * declarative.
 */
import { apiClient, extractErrorMessage } from './client';

/** The `meta.pagination` block every list endpoint returns. */
export type Pagination = {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number | null;
  to: number | null;
};

export type Page<T> = {
  data: T[];
  meta: { pagination: Pagination };
};

export type Envelope<T> = { data: T; meta: Record<string, unknown> };

/** Common list query parameters accepted by every paginated portal endpoint. */
export type PageQuery = {
  page?: number;
  per_page?: number;
};

/** Thrown when the account isn't linked to a clinical record yet (API returns 409). */
export class NotLinkedError extends Error {
  constructor() {
    super('Account is not linked to a clinical record.');
    this.name = 'NotLinkedError';
  }
}

/**
 * Thrown for the portal's business-rule refusals: a slot that was taken while
 * the user was looking at it, an invoice that is already paid, a dose that was
 * already recorded. `title` and `detail` come straight from the RFC 7807 body
 * and are safe to show the user.
 */
export class PortalConflictError extends Error {
  constructor(
    public readonly title: string,
    public readonly detail: string,
    public readonly type: string
  ) {
    super(detail);
    this.name = 'PortalConflictError';
  }
}

/** Thrown when the request body fails validation (422). */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly violations: { field: string; message: string }[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

function rethrow(e: any): never {
  const status = e?.response?.status;
  const body = e?.response?.data;
  const problem = body?.errors;

  if (status === 409) {
    // "Account Not Linked" is the one 409 that means "go link your record",
    // not "this action cannot be performed".
    if (problem?.type?.includes('patient-portal-not-linked')) {
      throw new NotLinkedError();
    }
    throw new PortalConflictError(
      problem?.title ?? 'Conflict',
      problem?.detail ?? extractErrorMessage(e),
      problem?.type ?? ''
    );
  }

  if (status === 422) {
    throw new ValidationError(extractErrorMessage(e), problem?.violations ?? []);
  }

  throw e;
}

export async function getOne<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  try {
    const res = await apiClient.get<Envelope<T>>(path, { params });
    return res.data.data;
  } catch (e: any) {
    rethrow(e);
  }
}

export async function getPage<T>(path: string, params?: Record<string, unknown>): Promise<Page<T>> {
  try {
    const res = await apiClient.get<Page<T>>(path, { params });
    return res.data;
  } catch (e: any) {
    rethrow(e);
  }
}

/** Like getPage but also surfaces the endpoint's extra meta (e.g. billing totals). */
export async function getPageWithMeta<T, M>(
  path: string,
  params?: Record<string, unknown>
): Promise<{ data: T[]; meta: M }> {
  try {
    const res = await apiClient.get<{ data: T[]; meta: M }>(path, { params });
    return res.data;
  } catch (e: any) {
    rethrow(e);
  }
}

export async function post<T>(
  path: string,
  body?: Record<string, unknown>,
  /** Extra per-request axios config (e.g. an Idempotency-Key header). Additive. */
  config?: { headers?: Record<string, string> }
): Promise<T> {
  try {
    const res = await apiClient.post<Envelope<T>>(path, body ?? {}, config);
    return res.data.data;
  } catch (e: any) {
    rethrow(e);
  }
}

export async function patch<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  try {
    const res = await apiClient.patch<Envelope<T>>(path, body ?? {});
    return res.data.data;
  } catch (e: any) {
    rethrow(e);
  }
}

export async function put<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  try {
    const res = await apiClient.put<Envelope<T>>(path, body ?? {});
    return res.data.data;
  } catch (e: any) {
    rethrow(e);
  }
}

/** Fetches a binary document (PDF) as a Blob — used by the download button. */
export async function getBlob(path: string): Promise<Blob> {
  try {
    const res = await apiClient.get(path, { responseType: 'blob' });
    return res.data as Blob;
  } catch (e: any) {
    rethrow(e);
  }
}
