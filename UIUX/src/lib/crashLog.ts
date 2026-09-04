/**
 * A retrievable record of render crashes.
 *
 * THERE IS NO CRASH-REPORTING SERVICE CONFIGURED FOR THIS APP. No Sentry, no
 * Bugsnag, no Crashlytics, no error-ingest endpoint on the Laravel side. This
 * module does not invent one and does not add an SDK. What it does is stop the
 * boundary from being a black hole: before this, a render error blanked the
 * screen and left nothing behind at all.
 *
 * So the crash is written to two places, both of which already exist:
 *
 *   1. `console.error` — visible in `expo start`, in a device log (adb logcat /
 *      Console.app) and in the browser console on the deployed web build.
 *   2. AsyncStorage, as a bounded ring of the last few entries, readable later
 *      via `readCrashLog()` — including from a support session with the device
 *      in hand, and on web from devtools.
 *
 * …and, since P4.9, to a third place: a SCRUBBED summary is queued and sent
 * best-effort to `POST /api/v1/client-errors` on the next launch, so a crash
 * on a clinician's phone is visible to the team without anybody phoning in.
 *
 * PRIVACY — THE WHOLE POINT OF THIS FILE. A React error message and component
 * stack quote PROPS, and in this app props are patient names, medical record
 * numbers and diagnoses. The on-device ring (`readCrashLog`) keeps the raw
 * text, because it never leaves the phone and a developer with the device in
 * hand needs the real thing. NOTHING RAW IS EVER QUEUED FOR UPLOAD. The upload
 * queue holds only the output of `scrubCrash()` below, which is built by
 * ALLOWLIST: it decides what to KEEP, not what to remove. See the block
 * comment above `scrubCrash` for exactly what survives.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CRASH_LOG_KEY = 'opes_emr_crash_log';

/** Enough to see a repeat, few enough not to grow unbounded on a cheap phone. */
const MAX_ENTRIES = 10;

/** Component stacks are long and quote props. Keep the tail bounded. */
const MAX_STACK_CHARS = 2_000;
const MAX_MESSAGE_CHARS = 500;

export type CrashEntry = {
  /** Short, readable, and safe to ask a patient to read down a phone line. */
  reference: string;
  at: string;
  name: string;
  message: string;
  componentStack: string;
  /** From `src/buildInfo.ts`, so an old entry is not blamed on new code. */
  build?: string;
};

/** `OPES-K3F9QZ` — spoken over the phone, matched against the log on the device. */
export function makeReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `OPES-${out}`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
}

/**
 * Record a crash. Never throws and never rejects: this runs from inside
 * `componentDidCatch`, and a failure to write the log must not become a second
 * error on top of the first.
 */
export async function recordCrash(
  error: unknown,
  componentStack: string,
  reference: string,
  build?: string
): Promise<void> {
  const entry: CrashEntry = {
    reference,
    at: new Date().toISOString(),
    name: error instanceof Error ? error.name : typeof error,
    message: truncate(error instanceof Error ? error.message : String(error), MAX_MESSAGE_CHARS),
    componentStack: truncate(componentStack ?? '', MAX_STACK_CHARS),
    build,
  };

  // Always to the console first: it is the one sink that works even if storage
  // is unavailable, and it is where a developer running the app will look.
  // eslint-disable-next-line no-console
  console.error(`[OPES crash ${reference}]`, error, componentStack);

  try {
    const existing = await readCrashLog();
    const next = [entry, ...existing].slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(CRASH_LOG_KEY, JSON.stringify(next));
  } catch {
    // Storage full, or unavailable on this platform. The console line above
    // already happened; losing the persisted copy is not worth a second crash.
  }

  // The ONLY path from a crash to the network, and it goes through the
  // scrubber. `entry` (raw) is stored locally; `scrubCrash(entry)` is queued.
  await queueScrubbedCrash(scrubCrash(entry));
}

/** The stored crashes, newest first. Returns [] rather than throwing. */
export async function readCrashLog(): Promise<CrashEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CrashEntry[]) : [];
  } catch {
    return [];
  }
}

export async function clearCrashLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CRASH_LOG_KEY);
  } catch {
    // Nothing to do, and nothing worth failing over.
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * SCRUBBING
 *
 * ALLOWLIST, NOT DENYLIST — and the difference matters more here than the
 * usual "defence in depth" hand-wave. A denylist ("strip anything shaped like
 * OPES-26-7F3A-9K8L, an email, a +237 number") is a list of the leaks you
 * thought of. The one that ends the hospital's week is the one you did not:
 * a surname in a validation message, a village in an address prop, a free-text
 * complaint quoted inside `Objects are not valid as a React child`.
 *
 * So `scrubCrash` starts from empty and adds back only values it can prove are
 * code rather than data:
 *
 *   reference   — generated on-device from a 32-char alphabet. No input.
 *   at          — ISO timestamp, re-serialised from Date.parse. No input.
 *   name        — the error TYPE, and only if it looks like a JS constructor
 *                 name (`TypeError`). Anything else becomes `Error`.
 *   messageShape— the message with every token that is not in a fixed
 *                 vocabulary of JavaScript/React error words replaced by `‹›`.
 *                 `cannot read properties of undefined (reading 'name')`
 *                 survives; `Patient Ngozi Abena (OPES-26-7F3A-9K8L)` does not.
 *   components  — component NAMES lifted out of the stack by regex, kept only
 *                 if they are plain identifiers. Never the `(at file:line)`
 *                 tail, never props.
 *   build       — BUILD_STAMP, charset-restricted.
 *   route       — the active route NAME, if it is a plain identifier.
 *   locale      — 'en' or 'fr'. Nothing else is a locale this app has.
 *
 * Then, as a second gate that should never fire, `assertClean` re-checks every
 * assembled string against the obvious PHI patterns and blanks the field if
 * one somehow got through. That is the denylist, and it is deliberately the
 * *last* line rather than the first.
 *
 * WHAT COULD STILL SLIP THROUGH: a patient value that is spelled exactly like
 * a vocabulary word. `VOCABULARY` is therefore technical terms only — no given
 * names, no place names, no clinical words. A surname of "Function" would
 * leak the word "Function" and nothing else, which is the size of hole this
 * design leaves.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Every word a scrubbed message may contain. Lowercased on compare.
 *
 * Sourced from V8/JavaScriptCore/Hermes error text and React's own invariant
 * messages. Adding a word here widens the hole by exactly that word, so:
 * technical terms only, and never anything a person or a diagnosis could be
 * called.
 */
const VOCABULARY = new Set<string>([
  // shape of a JS runtime error
  'cannot', 'read', 'properties', 'property', 'of', 'undefined', 'null', 'is',
  'not', 'a', 'an', 'the', 'function', 'object', 'objects', 'array', 'string',
  'number', 'boolean', 'symbol', 'constructor', 'iterable', 'assign', 'to',
  'in', 'on', 'at', 'from', 'for', 'with', 'and', 'or', 'as', 'be', 'been',
  'has', 'have', 'was', 'were', 'must', 'should', 'may', 'no', 'nan',
  'defined', 'declared', 'initialization', 'initializing', 'before',
  'reading', 'writing', 'calling', 'called', 'invalid', 'unexpected', 'token',
  'json', 'parse', 'stringify', 'circular', 'structure', 'converted', 'value',
  'type', 'typeof', 'instanceof', 'stack', 'size', 'exceeded', 'maximum',
  'call', 'recursion', 'range', 'index', 'out', 'bounds', 'length', 'key',
  'keys', 'map', 'filter', 'reduce', 'foreach', 'slice', 'split', 'join',
  'match', 'replace', 'includes', 'push', 'pop', 'access', 'assignment',
  'const', 'variable', 'reference', 'error', 'failed', 'failure', 'aborted',
  'timeout', 'timed', 'network', 'request', 'response', 'status', 'code',
  // React / React Native / navigation
  'react', 'element', 'elements', 'component', 'components', 'render',
  'rendered', 'rendering', 'child', 'children', 'props', 'prop', 'state',
  'hook', 'hooks', 'effect', 'context', 'provider', 'ref',
  'valid', 'minified', 'visit', 'full', 'message', 'text', 'strings',
  'nodes', 'node', 'view', 'native', 'module', 'bridge', 'nativemodule',
  'navigation', 'navigator', 'screen', 'route', 'navigate', 'handle',
  'more', 'fewer', 'than', 'during', 'previous', 'order', 'rules',
  'update', 'unmounted', 'mounted', 'memory', 'leak', 'setstate',
  'suspended', 'suspense', 'boundary', 'fallback', 'lazy', 'promise',
  // words that only ever appear as structure
  'expected', 'received', 'got', 'instead', 'here', 'see', 'https', 'http',
]);

/** A JS constructor name, and nothing that could be a person. */
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;

/** Placeholder for a token that was not on the allowlist. */
const REDACTED = '‹›';

/** Bounds, so a crash loop cannot post a megabyte over a metered 2G link. */
const MAX_SHAPE_CHARS = 300;
const MAX_COMPONENTS = 20;
const MAX_QUEUE = 5;

/**
 * The denylist that runs LAST. If any of these matches an already-assembled
 * field, the scrubber has a bug and the field is dropped rather than sent.
 */
const IDENTIFIER_PATTERNS: RegExp[] = [
  /OPES-\d{2}-[0-9A-Z]{4}-[0-9A-Z]{4}/i, // medical id (GenerateMedicalIdAction)
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // uuid
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // email
  /\+?237\s?\d[\d\s-]{6,}/, // Cameroon msisdn
];

/**
 * The above, plus any long digit run (account number, national id, an msisdn
 * written without its country code). Applied to free text only: a build stamp
 * legitimately contains `2026-09-02` and a short commit sha.
 */
const PHI_PATTERNS: RegExp[] = [...IDENTIFIER_PATTERNS, /\d{5,}/];

export type ScrubbedCrash = {
  reference: string;
  at: string;
  name: string;
  message_shape: string;
  components: string[];
  build: string | null;
  route: string | null;
  locale: string | null;
};

function assertClean(value: string): string {
  return PHI_PATTERNS.some((p) => p.test(value)) ? REDACTED : value;
}

/**
 * Reduce a message to its shape.
 *
 * Split on whitespace, then peel leading/trailing punctuation off each token
 * so `undefined (reading` and `'name')` still resolve to vocabulary words.
 * A token whose core is not in VOCABULARY is replaced whole — punctuation and
 * all — so a quoted patient name cannot survive as its quotes plus a fragment.
 */
export function scrubMessage(raw: string): string {
  const shape = String(raw ?? '')
    .slice(0, 1_000)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      // Pure punctuation carries structure and no data.
      if (/^[^\p{L}\p{N}]+$/u.test(token)) return token;
      const core = token.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
      return VOCABULARY.has(core.toLowerCase()) ? token : REDACTED;
    })
    // Collapse runs of redactions: five unknown words in a row still say only
    // "five unknown words", and the count itself is a (weak) signal.
    .join(' ')
    .replace(/(?:‹›\s*){2,}/g, `${REDACTED} `)
    .trim();

  return assertClean(shape.slice(0, MAX_SHAPE_CHARS));
}

/**
 * Component NAMES only. React writes frames as `    in Foo (at Bar.tsx:12)`;
 * the `(at …)` tail is dropped because on the web build it can carry a query
 * string, and a name that is not a plain identifier is dropped because then it
 * is not a component name at all.
 *
 * RESIDUAL RISK, stated plainly: a component name is code, not data — unless
 * somebody gives a component a `displayName` computed from a prop. No
 * component in this app does, and if one ever did, the leak would be that one
 * string. The PHI gate below catches the id-shaped version of that mistake;
 * it cannot catch a name-shaped one, because `AbenaCard` and `VitalsCard` are
 * the same thing to a regex.
 */
export function scrubComponentStack(raw: string): string[] {
  const out: string[] = [];
  for (const line of String(raw ?? '').split('\n')) {
    // The WHOLE next word, not a prefix of it. Capturing `[A-Za-z0-9_]+` would
    // read `OPES` out of `OPES-26-7F3A-9K8L` and cheerfully keep it; taking
    // `\S+` and demanding the entire token be an identifier drops the frame.
    const m = /^\s*(?:in|at)\s+(\S+)/.exec(line);
    if (!m) continue;
    const name = m[1];
    if (!IDENTIFIER.test(name)) continue;
    if (PHI_PATTERNS.some((p) => p.test(name))) continue;
    out.push(name);
    if (out.length >= MAX_COMPONENTS) break;
  }
  return out;
}

function scrubIdentifier(value: string | null | undefined): string | null {
  if (!value) return null;
  return IDENTIFIER.test(value) ? value : null;
}

/**
 * BUILD_STAMP is `v1.0.0 · 4c93923 · 2026-09-02`; nothing else is allowed.
 *
 * The charset alone is not enough — `OPES-26-7F3A-9K8L` fits inside it — so
 * the id gate runs here too, and a stamp that trips it is dropped rather than
 * blanked: a build we cannot vouch for is worth less than the risk.
 */
function scrubBuild(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.slice(0, 60);
  if (!/^[A-Za-z0-9.·:_\- ]+$/.test(trimmed)) return null;
  return IDENTIFIER_PATTERNS.some((p) => p.test(trimmed)) ? null : trimmed;
}

function scrubLocale(value: string | null | undefined): string | null {
  return value === 'en' || value === 'fr' ? value : null;
}

export type CrashContext = { build?: string | null; route?: string | null; locale?: string | null };

/** Build the only representation of a crash that is ever allowed off-device. */
export function scrubCrash(entry: CrashEntry, context: CrashContext = {}): ScrubbedCrash {
  const parsed = Date.parse(entry.at);

  return {
    reference: IDENTIFIER.test(String(entry.reference ?? '').replace('OPES-', ''))
      ? entry.reference
      : 'OPES-UNKNWN',
    at: new Date(Number.isNaN(parsed) ? Date.now() : parsed).toISOString(),
    name: IDENTIFIER.test(String(entry.name ?? '')) ? entry.name : 'Error',
    message_shape: scrubMessage(entry.message),
    components: scrubComponentStack(entry.componentStack),
    build: scrubBuild(context.build ?? entry.build),
    route: scrubIdentifier(context.route),
    locale: scrubLocale(context.locale),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * UPLOAD QUEUE
 *
 * Deliberately meagre. These phones are on 2G and metered data:
 *   • at most five reports are held, and the queue is dropped wholesale if it
 *     cannot be sent — a crash report is never worth a patient's bytes;
 *   • the flush is fired and forgotten at launch, never awaited, never
 *     blocking a screen;
 *   • ONE attempt per report. No retry, no backoff. A crash loop that could
 *     not reach the server yesterday must not spend the patient's credit
 *     re-trying today.
 * ═══════════════════════════════════════════════════════════════════════ */

const QUEUE_KEY = 'opes_emr_crash_upload_queue';

/** Short: this is background work behind a splash screen, not a patient's read. */
const UPLOAD_TIMEOUT_MS = 8_000;

async function readQueue(): Promise<ScrubbedCrash[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScrubbedCrash[]) : [];
  } catch {
    return [];
  }
}

/** Queue a SCRUBBED report. There is no overload of this that takes raw text. */
export async function queueScrubbedCrash(report: ScrubbedCrash): Promise<void> {
  try {
    const existing = await readQueue();
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([report, ...existing].slice(0, MAX_QUEUE)));
  } catch {
    // Losing the upload copy is not worth a second crash.
  }
}

export async function readCrashQueue(): Promise<ScrubbedCrash[]> {
  return readQueue();
}

export async function clearCrashQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    // Nothing worth failing over.
  }
}

/**
 * Best-effort flush, called once at launch. Never throws, never blocks.
 *
 * The queue is CLEARED FIRST, before a byte is sent. That is intentional: it
 * makes a failed send a permanent drop rather than something that accumulates
 * and re-sends forever on a metered link. Losing a crash report is fine.
 */
export async function flushCrashQueue(): Promise<number> {
  let sent = 0;
  try {
    const queue = await readQueue();
    if (queue.length === 0) return 0;

    await clearCrashQueue();

    // Unauthenticated reports are refused by the server, so do not spend the
    // bytes finding that out.
    const { getStoredToken, apiClient, NO_RETRY } = await import('../api/client');
    const token = await getStoredToken();
    if (!token) return 0;

    for (const report of queue) {
      try {
        await apiClient.post('/client-errors', report, {
          ...NO_RETRY,
          timeout: UPLOAD_TIMEOUT_MS,
        });
        sent += 1;
      } catch {
        // One attempt each. A server that is down stays undisturbed.
        break;
      }
    }
  } catch {
    // Storage or module load failed. Launch continues regardless.
  }
  return sent;
}
