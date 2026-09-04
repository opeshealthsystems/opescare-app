/**
 * Offline read cache.
 *
 * The app had none. `@react-native-async-storage/async-storage` was a declared
 * dependency with zero uses, every API response is `no-store`, and so a patient
 * with no signal could not see their next appointment, their medication list or
 * their Health ID card — the last of which is the artefact they are meant to
 * present at a facility desk, in a building with poor reception.
 *
 * This is deliberately NOT a sync engine. It caches successful reads and hands
 * them back when the network fails, and that is all:
 *
 *   * Reads only. Nothing queued, nothing replayed, no write ever deferred.
 *   * Every entry records when it was captured, and every caller is expected to
 *     show that through the existing StaleNotice / LastUpdatedLine components.
 *     Cached clinical data is never presented as live.
 *   * Entries older than the resource's own age cap are dropped rather than
 *     shown. A dose schedule from last month is worse than an honest "we could
 *     not load this".
 *   * The whole cache is cleared on sign-out, so a shared phone does not leak
 *     one patient's record to the next — and, belt and braces, every entry is
 *     *scoped* to an account id, so a session that ended some other way (an
 *     expired token, a second person signing straight in) cannot surface the
 *     previous patient's record either. See `setCacheScope`.
 *   * It is bounded. A patient's phone is not storage we may fill: one entry
 *     may not exceed MAX_ENTRY_BYTES, the whole cache may not exceed
 *     MAX_TOTAL_BYTES, and the oldest captures are evicted to stay under it.
 *
 * WHAT IS DELIBERATELY NOT CACHED is as much a part of this module as what is;
 * see `NEVER_CACHE` at the bottom.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'opes_cache_v1:';

/** Where the scope marker and the size index live. Not scoped themselves. */
const SCOPE_KEY = `${PREFIX}__scope`;
const INDEX_KEY = `${PREFIX}__index`;

/**
 * A week. Long enough to cover a patient who opens the app rarely; short enough
 * that nothing on screen is from a different episode of care. Individual
 * callers may ask for less, and most clinical resources do — see `CACHE_AGE`.
 */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Per-entry and whole-cache size ceilings.
 *
 * `GET /patient/medications` measured 66 KB uncompressed in audit 28. The entry
 * ceiling has to clear a payload like that, and it has to stop a runaway
 * document or imaging list from quietly taking a megabyte of a phone that may
 * only have a few hundred spare.
 */
export const MAX_ENTRY_BYTES = 128 * 1024;
export const MAX_TOTAL_BYTES = 1024 * 1024;

export type CacheEntry<T> = {
  data: T;
  /** When the payload was received from the server. */
  capturedAt: Date;
};

type StoredEnvelope<T> = { v: 1; at: number; data: T };

/** One row per stored entry: full storage key, capture time, serialised size. */
type IndexRow = { k: string; at: number; n: number };

// ── Scope ──────────────────────────────────────────────────────────────────

/**
 * The account whose data is currently cached.
 *
 * `clearCache()` on sign-out is the primary guarantee, but it only runs on the
 * path where somebody deliberately signs out. A ward phone whose token merely
 * expired, or which a second person signs into directly, never walks it — and
 * on that path the first patient's medication list was still sitting on disk.
 *
 * So every entry is stored under the account it belongs to, and binding a
 * different account wipes everything that came before it. A read under scope A
 * cannot see a write made under scope B: not because we trust a caller to have
 * cleared, but because the key does not match.
 *
 * `null` — nobody identified yet — reads and writes nothing at all. There is no
 * anonymous bucket for data to accumulate in or leak from.
 */
let scope: string | null = null;

/**
 * Bind the cache to an account. Called from the API layer the moment the server
 * says who is signed in, so no screen or context has to remember to. Wipes the
 * cache whenever the account changes.
 */
export async function setCacheScope(accountId: string | number | null): Promise<void> {
  const next = accountId === null || accountId === undefined ? null : String(accountId);
  // Learn what a previous run left behind before deciding this is a new person,
  // or every relaunch would wipe the cache it exists to serve.
  if (next !== null) await restoreCacheScope();
  if (next === scope) return;
  // A different person: nothing of the previous one survives.
  await clearCache();
  scope = next;
  try {
    if (next === null) await AsyncStorage.removeItem(SCOPE_KEY);
    else await AsyncStorage.setItem(SCOPE_KEY, next);
  } catch {
    // Ignored — an unwritable marker costs us a cold cache, never a leak.
  }
}

/** The live scope. Exposed for tests and diagnostics. */
export function cacheScope(): string | null {
  return scope;
}

/**
 * Restore the scope written by a previous run of the app.
 *
 * Without this a relaunch starts at `scope === null`, every read misses, and the
 * patient who opened the app with no signal — the entire point of the cache —
 * sees nothing. The marker is only ever *confirmed* by a later `setCacheScope`
 * from an authenticated response; if a different account turns out to be signed
 * in, that call wipes what this restored.
 */
export async function restoreCacheScope(): Promise<string | null> {
  if (scope !== null) return scope;
  try {
    const stored = await AsyncStorage.getItem(SCOPE_KEY);
    if (stored) scope = stored;
  } catch {
    // ignored
  }
  return scope;
}

/**
 * The storage key for `key` under the live scope, restoring the scope a previous
 * run wrote if this process has not learned it yet.
 */
async function storageKey(key: string): Promise<string | null> {
  const live = scope ?? (await restoreCacheScope());
  if (live === null) return null;
  return `${PREFIX}${live}|${key}`;
}

// ── Index and eviction ─────────────────────────────────────────────────────

async function readIndex(): Promise<IndexRow[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as IndexRow[];
    return Array.isArray(parsed)
      ? parsed.filter((r) => r && typeof r.k === 'string' && typeof r.at === 'number' && typeof r.n === 'number')
      : [];
  } catch {
    return [];
  }
}

async function writeIndex(rows: IndexRow[]): Promise<void> {
  try {
    if (rows.length === 0) await AsyncStorage.removeItem(INDEX_KEY);
    else await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(rows));
  } catch {
    // ignored
  }
}

/**
 * Bring the cache back under MAX_TOTAL_BYTES by dropping the oldest captures
 * first. Oldest, not least-recently-read: an entry's entire value here is its
 * freshness, and reads are not tracked.
 */
async function evict(rows: IndexRow[]): Promise<IndexRow[]> {
  let total = rows.reduce((sum, r) => sum + r.n, 0);
  if (total <= MAX_TOTAL_BYTES) return rows;
  const ordered = [...rows].sort((a, b) => a.at - b.at);
  const dropped: string[] = [];
  while (total > MAX_TOTAL_BYTES && ordered.length) {
    const victim = ordered.shift()!;
    dropped.push(victim.k);
    total -= victim.n;
  }
  if (dropped.length) {
    try {
      await AsyncStorage.multiRemove(dropped);
    } catch {
      // ignored
    }
  }
  return ordered;
}

/** Total bytes currently held. Exposed for tests. */
export async function cacheSizeBytes(): Promise<number> {
  return (await readIndex()).reduce((sum, r) => sum + r.n, 0);
}

// ── Read and write ─────────────────────────────────────────────────────────

/**
 * Read a cached payload, or null if there is none, it is unreadable, or it is
 * older than `maxAgeMs`.
 *
 * Never throws: a cache miss and a broken cache must look the same to a screen.
 */
export async function readCache<T>(key: string, maxAgeMs: number = MAX_AGE_MS): Promise<CacheEntry<T> | null> {
  try {
    const full = await storageKey(key);
    if (!full) return null;
    const raw = await AsyncStorage.getItem(full);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredEnvelope<T>;
    if (!parsed || parsed.v !== 1 || typeof parsed.at !== 'number') return null;
    const age = Date.now() - parsed.at;
    // A clock that moved backwards makes `age` negative; treat that as fresh
    // rather than throwing the entry away.
    if (age > maxAgeMs) {
      await removeCache(key);
      return null;
    }
    return { data: parsed.data, capturedAt: new Date(parsed.at) };
  } catch {
    return null;
  }
}

/**
 * Store a payload. Failure is ignored on purpose — a full disk must never turn
 * a successful load into an error on screen.
 *
 * An oversized payload is not stored and never truncated: half a medication
 * list is a worse artefact than no medication list.
 */
export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const full = await storageKey(key);
    if (!full) return;
    const at = Date.now();
    const envelope: StoredEnvelope<T> = { v: 1, at, data };
    const body = JSON.stringify(envelope);
    if (body.length > MAX_ENTRY_BYTES) {
      // Drop any older, smaller copy too, rather than leave one behind that a
      // caller would reasonably read as having just been refreshed.
      await removeCache(key);
      return;
    }
    await AsyncStorage.setItem(full, body);
    const rows = (await readIndex()).filter((r) => r.k !== full);
    rows.push({ k: full, at, n: body.length });
    await writeIndex(await evict(rows));
  } catch {
    // Nothing to do, and nothing to tell the patient.
  }
}

export async function removeCache(key: string): Promise<void> {
  try {
    const full = await storageKey(key);
    if (!full) return;
    await AsyncStorage.removeItem(full);
    const rows = await readIndex();
    const left = rows.filter((r) => r.k !== full);
    if (left.length !== rows.length) await writeIndex(left);
  } catch {
    // ignored
  }
}

/**
 * Drop every cached payload, of every scope. Called on sign-out: the phone may
 * be shared, and the next person to open the app must not see this patient's
 * record.
 *
 * The scope marker and the size index go with it — anything else would leave
 * the next sign-in reading an index of entries that no longer exist.
 */
export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // ignored
  }
  scope = null;
}

// ── Age policy ─────────────────────────────────────────────────────────────

/**
 * How old each kind of thing may be before it is withheld rather than shown.
 *
 * These are not tuning knobs. Each is a judgement about what an old copy does
 * to the person acting on it, and the week-long default is reserved for things
 * that genuinely do not change.
 */
export const CACHE_AGE = {
  /** Identity. Changes when a record is linked, and essentially never after. */
  identity: MAX_AGE_MS,
  /**
   * Allergies and long-term conditions. A day-old allergy list is very nearly
   * always better than a blank one — the failure mode of NOT showing it is a
   * patient who cannot tell a clinician what they react to. It changes rarely,
   * and additions matter far more than removals, so an old copy under-states
   * rather than over-states risk.
   */
  allergies: 7 * 24 * 60 * 60 * 1000,
  /**
   * The medication list. Held to two days, not a week: a stopped drug that is
   * still listed is the dangerous direction, and two days bounds how long
   * somebody can keep taking it on our say-so. Only ever shown behind the stale
   * banner, with its capture time.
   */
  medications: 2 * 24 * 60 * 60 * 1000,
  /**
   * Appointments. Times move, and a week-old copy would send somebody to a
   * clinic on the wrong day — a journey they pay for. Two days.
   */
  appointments: 2 * 24 * 60 * 60 * 1000,
  /**
   * FINALISED, already-released results and past encounter notes. These are
   * historical records: once released they do not change, so an old copy is not
   * a wrong copy. Pending and unreleased results are never cached (NEVER_CACHE).
   */
  finalisedResult: MAX_AGE_MS,
  /** Invoices and receipts. Financial history, immutable once issued. */
  billing: MAX_AGE_MS,
  /** Document *metadata* — never the file bytes. */
  documents: MAX_AGE_MS,
  /** The home dashboard: a summary of all of the above, held to the tightest. */
  dashboard: 2 * 24 * 60 * 60 * 1000,
} as const;

// ── Keys ───────────────────────────────────────────────────────────────────
// Named in one place so a screen cannot silently collide with another's cache.

export const cacheKeys = {
  account: 'account',
  dashboard: 'dashboard',
  healthId: 'health-id',
  medications: (filter: string) => `medications:${filter}`,
  appointmentsHome: 'appointments-home',
  appointmentList: (tab: string) => `appointments:${tab}`,

  // The wider offline read set. Each is consumed by exactly one screen and
  // carries an age cap from CACHE_AGE above.
  appointment: (id: string | number) => `appointment:${id}`,
  prescriptions: 'prescriptions',
  medication: (id: string | number) => `medication:${id}`,
  medicationSchedule: (id: string | number) => `medication-schedule:${id}`,
  encounters: 'encounters',
  encounter: (id: string | number) => `encounter:${id}`,
  diagnoses: 'diagnoses',
  allergies: 'allergies',
  immunizations: 'immunizations',
  vitals: 'vitals',
  timeline: 'timeline',
  diagnosticsDashboard: 'diagnostics-dashboard',
  labOrder: (id: string | number) => `lab-order:${id}`,
  imagingHistory: (filter: string = 'all') => `imaging-history:${filter}`,
  imagingOrder: (id: string | number) => `imaging-order:${id}`,
  documents: 'documents',
  invoices: 'invoices',
  invoice: (id: string | number) => `invoice:${id}`,
  profile: 'profile',
} as const;

/**
 * NOT CACHED, ON PURPOSE. Read this before adding a key above.
 *
 * This is documentation with a test behind it, not a runtime guard — there is
 * deliberately no mechanism that could be "configured" into caching one of
 * these.
 *
 *   doctor:results-inbox        A stale list of critical results is a hazard,
 *                               not a convenience. Its whole value is that it
 *                               shows what is outstanding RIGHT NOW; a copy
 *                               from this morning can show a result as unread
 *                               that has since been actioned, or — far worse —
 *                               omit one that arrived since. A clinician who
 *                               has learned that the inbox works offline will
 *                               trust an empty one. It must fail loudly.
 *   lab:pending                 A result whose status can still change must be
 *   imaging:pending             read live, for the same reason, one patient at
 *                               a time.
 *   messaging:threads           Cheap to reload, and a cached thread missing
 *                               the last reply reads as "they never answered".
 *   telemedicine:session        Real-time by definition; a cached room state is
 *                               meaningless.
 *   scheduling:availability     Booking against a cached slot list books
 *                               nothing.
 *   documents:file-bytes        Large, and the metadata is enough to say what
 *                               exists.
 *
 * And, above all of these: no WRITE is ever cached, queued or replayed.
 */
export const NEVER_CACHE = [
  'doctor:results-inbox',
  'lab:pending',
  'imaging:pending',
  'messaging:threads',
  'telemedicine:session',
  'scheduling:availability',
  'documents:file-bytes',
] as const;
