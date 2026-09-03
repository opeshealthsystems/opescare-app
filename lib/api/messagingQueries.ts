/**
 * Messaging — client-side contract, normalisers and helpers.
 *
 * This file deliberately contains NO new network calls: the four messaging
 * hooks in `lib/api/queries.ts` (`useMessageThreads`, `useMessageThread`,
 * `useSendThreadMessage`, `useStartMessageThread`) already cover every route
 * the mobile API exposes, and duplicating them here would double-fetch.
 * What lives here instead is the part `queries.ts` can't own: the shape of a
 * *non-text* message, and the pure functions the Messages screen needs.
 *
 * ── What the backend actually supports today ────────────────────────────
 * Verified against `apps/api-laravel/app/Http/Controllers/Api/Mobile/
 * MobileMessagingController.php` and the `messages` migration
 * (`2026_05_20_000000_create_communication_alerts_tasks_messaging_tables.php`):
 *
 *  • `GET /mobile/messages/threads/{id}` serialises exactly five fields per
 *    message — `id`, `is_mine`, `body`, `status`, `created_at`. Nothing else.
 *  • The `messages` table DOES have a `message_type` string column, but the
 *    service writes `'text'` unconditionally (`MessagingService::sendMessage`
 *    defaults `$type = 'text'` and the mobile controller never passes a type)
 *    and the controller never selects it into the response.
 *  • A `message_attachments` table, an Eloquent relation and a
 *    `MessageAttachmentService` (PDF/JPEG/PNG/DOCX) all exist, but the
 *    relation is never eager-loaded, never serialised, and no mobile route
 *    can create one. The only upload endpoint is B2B.
 *  • There is NO JSON/payload column on `messages`, so a form, an orderable
 *    test or a result card cannot be *stored* today without a migration.
 *  • There are no read-receipt columns at all (`read_at`/`delivered_at` do
 *    not exist); `messages.status` is a free string that is always `'sent'`.
 *
 * So: every optional field below is `undefined` in the current build, and
 * `describeMessage()` therefore returns a `text` variant for every real
 * message. The renderers exist so that the day the controller starts
 * serialising `message_type` / `attachments` / `payload`, the presentation is
 * already there — not so that the UI can invent content it wasn't given.
 * Nothing here fabricates data: an absent field renders as an absent card.
 */

import type { MessageThreadSummary, ThreadMessage } from './queries';

/* ────────────────────────────────────────────────────────────────────────
 * Wire shapes (optional = "the API may add this; it does not send it yet")
 * ──────────────────────────────────────────────────────────────────────── */

/** Mirrors the real `message_attachments` columns, so the client contract
 * matches the schema that already exists rather than inventing a new one. */
export interface MessageAttachment {
  id?: number | string;
  file_name: string;
  mime_type?: string | null;
  /** Bytes, as stored in `message_attachments.file_size`. */
  file_size?: number | null;
  /** `message_attachments.scan_status` — defaults to `'pending'` server-side. */
  scan_status?: string | null;
}

/** A key/value row inside a structured card (pre-consult summary, result
 * panel, order detail…). Purely presentational — the server decides the
 * labels because only the server knows the clinical vocabulary. */
export interface StructuredRow {
  label: string;
  value: string;
}

/**
 * The resource a structured message points at. The server sends a *kind and
 * an id*, never a route: letting a message body dictate an in-app path would
 * be a navigation-injection vector, so the mapping kind → route lives on the
 * client (`resolveResourceRoute`) and unknown kinds simply don't link.
 */
export interface StructuredResourceRef {
  kind: string;
  id?: string | null;
}

export interface StructuredMessagePayload {
  title?: string | null;
  subtitle?: string | null;
  rows?: StructuredRow[] | null;
  /** Optional call-to-action; only rendered when `resolveResourceRoute` can
   * map `resource.kind` to a screen that exists in this app. */
  resource?: StructuredResourceRef | null;
}

/** `ThreadMessage` widened with the fields the API is *able* to grow into. */
export type RichThreadMessage = ThreadMessage & {
  message_type?: string | null;
  attachments?: MessageAttachment[] | null;
  payload?: StructuredMessagePayload | null;
};

/* ────────────────────────────────────────────────────────────────────────
 * Normalisation
 * ──────────────────────────────────────────────────────────────────────── */

export type RenderableMessage =
  | { variant: 'text'; body: string }
  | { variant: 'attachment'; attachments: MessageAttachment[]; caption: string }
  | { variant: 'structured'; payload: StructuredMessagePayload; caption: string }
  /** The care team sent a type this build doesn't know how to draw. Shown as
   * an explicit "open it elsewhere" card rather than a blank bubble. */
  | { variant: 'unsupported'; rawType: string };

const STRUCTURED_TYPES = new Set(['form', 'questionnaire', 'result', 'order', 'card', 'structured']);

/**
 * Decide how one message should be drawn. Falls back to a plain text bubble
 * whenever there is a body to show, so an unrecognised `message_type` can
 * never blank out a message the patient is entitled to read.
 */
export function describeMessage(message: RichThreadMessage): RenderableMessage {
  const body = (message.body ?? '').trim();
  const attachments = (message.attachments ?? []).filter((a) => !!a?.file_name);
  if (attachments.length > 0) {
    return { variant: 'attachment', attachments, caption: body };
  }

  const type = (message.message_type ?? 'text').toLowerCase();
  const payload = message.payload ?? null;
  const hasPayload = !!payload && (!!payload.title || (payload.rows?.length ?? 0) > 0);

  if (STRUCTURED_TYPES.has(type) && hasPayload) {
    return { variant: 'structured', payload: payload as StructuredMessagePayload, caption: body };
  }
  if (body.length > 0) {
    return { variant: 'text', body };
  }
  return { variant: 'unsupported', rawType: type };
}

/**
 * Map a server-supplied resource *kind* onto a route that genuinely exists
 * under `app/`. Returns null for anything unknown — the caller then renders
 * the card without a CTA instead of pushing a route that would 404.
 */
export function resolveResourceRoute(resource?: StructuredResourceRef | null): string | null {
  if (!resource?.kind) return null;
  const id = resource.id ? String(resource.id) : null;
  switch (resource.kind.toLowerCase()) {
    case 'survey':
    case 'questionnaire':
    case 'form':
      return id ? `/surveys/${id}` : '/surveys';
    case 'lab_result':
    case 'lab':
      return id ? `/labs/${id}` : '/labs';
    case 'prescription':
      return id ? `/prescriptions/${id}` : '/prescriptions';
    case 'appointment':
      return id ? `/appointments/${id}` : '/appointments';
    case 'document':
      return '/documents';
    default:
      return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Thread-list helpers
 * ──────────────────────────────────────────────────────────────────────── */

function activityTime(thread: MessageThreadSummary): number {
  const iso = thread.last_message?.created_at ?? thread.updated_at;
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Order threads by real conversation activity.
 *
 * The API sorts by `message_threads.updated_at`, but `Message` declares no
 * `$touches`, so posting a message never bumps the parent thread — server
 * order is effectively thread *creation* order. Sorting on the last message's
 * timestamp here is what makes the inbox behave like an inbox. Reported as a
 * backend bug; this is the client-side mitigation, not a fix.
 */
export function sortThreadsByActivity(threads: MessageThreadSummary[]): MessageThreadSummary[] {
  return [...threads].sort((a, b) => activityTime(b) - activityTime(a));
}

/** Count of threads with unread inbound messages. Thread-level, not
 * message-level: `unread` is a boolean and no per-message read state exists. */
export function countUnreadThreads(threads: MessageThreadSummary[]): number {
  return threads.reduce((total, thread) => total + (thread.unread ? 1 : 0), 0);
}

/** Case-insensitive filter over the two text fields the list actually has. */
export function filterThreads(threads: MessageThreadSummary[], query: string): MessageThreadSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return threads;
  return threads.filter((thread) => {
    const title = (thread.title ?? '').toLowerCase();
    const preview = (thread.last_message?.body ?? '').toLowerCase();
    return title.includes(needle) || preview.includes(needle);
  });
}

/** Up to two initials for the avatar. `title` is the only human-readable
 * name the threads endpoint returns (the controller writes the provider's
 * name into it when the thread is started). */
export function initialsFor(name: string | null | undefined): string {
  const parts = (name ?? '')
    .replace(/\b(dr|prof|mr|mrs|ms|m|mme)\.?\b/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/* ────────────────────────────────────────────────────────────────────────
 * Message-stream helpers
 * ──────────────────────────────────────────────────────────────────────── */

export interface MessageDayGroup {
  /** `YYYY-MM-DD` in local time; `''` when the message carries no timestamp. */
  key: string;
  messages: RichThreadMessage[];
}

function dayKey(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Split an already-chronological message list into per-day runs so the
 * stream can carry date separators like the reference chat screens. */
export function groupMessagesByDay(messages: RichThreadMessage[]): MessageDayGroup[] {
  const groups: MessageDayGroup[] = [];
  for (const message of messages) {
    const key = dayKey(message.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.messages.push(message);
    else groups.push({ key, messages: [message] });
  }
  return groups;
}

/** True when two adjacent messages should be drawn as one visual cluster:
 * same author, less than five minutes apart. */
export function isSameCluster(
  previous: RichThreadMessage | undefined,
  current: RichThreadMessage,
): boolean {
  if (!previous) return false;
  if (previous.is_mine !== current.is_mine) return false;
  if (!previous.created_at || !current.created_at) return false;
  const gap = new Date(current.created_at).getTime() - new Date(previous.created_at).getTime();
  if (Number.isNaN(gap)) return false;
  return gap >= 0 && gap < 5 * 60 * 1000;
}

/** Human file size for attachment cards. */
export function formatFileSize(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Short uppercase label for the file-type chip, e.g. `application/pdf` → PDF. */
export function fileKindLabel(attachment: MessageAttachment): string {
  const mime = (attachment.mime_type ?? '').toLowerCase();
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('word') || mime.includes('officedocument.wordprocessing')) return 'DOC';
  if (mime.startsWith('image/')) return mime.split('/')[1]?.toUpperCase() ?? 'IMG';
  const extension = attachment.file_name.split('.').pop();
  return extension && extension.length <= 4 ? extension.toUpperCase() : 'FILE';
}
