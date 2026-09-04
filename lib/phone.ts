/**
 * One answer to one question: **is this string a number a patient could
 * actually ring?**
 *
 * The `care_facilities` register is a real MINSANTE/OpenStreetMap import, not a
 * clean dataset. Measured against the live directory on 2026-09-04
 * (`GET /mobile/facilities`, all 137 pages, 2 728 rows):
 *
 *  - **1 840 rows (67.4 %) carry the literal string `"N/A"`** in
 *    `phone_primary` — not `null`, not `""`. Anything that tested the field for
 *    truthiness therefore believed those facilities had a phone number and
 *    offered a Call button that dialled `tel:NA` and silently did nothing.
 *  - `phone_secondary` is `null` on every single row.
 *  - The remaining 888 rows hold 7-, 8-, 9- or 12-digit numbers, all genuine
 *    (the shortest, `"233 26 07"`, is a pre-2010 Limbe landline).
 *  - Exactly one row holds two numbers in one field:
 *    `"+237673026232,691890761"`. Naively stripping punctuation to build a
 *    `tel:` URL concatenates them into a 21-digit number that reaches nobody.
 *
 * No other placeholder spelling appears in the live data — no `"-"`, no empty
 * string, no `"none"`, no whitespace-only value — but the register is edited by
 * hand, so {@link usablePhone} rejects the usual family of them by name as well
 * as by the digit-count rule that already covers today's data.
 *
 * Every screen that renders or dials a phone number goes through this module,
 * so "has a number" and "can be dialled" can never drift apart again.
 */

/**
 * Values a human types into a "phone" column to mean *there isn't one*.
 * Compared after trimming, lower-casing and removing inner whitespace, so
 * `"N / A"` and `"n/a"` collapse to the same token.
 */
const PLACEHOLDERS = new Set([
  'n/a',
  'na',
  'n.a.',
  'n/d',
  'nd',
  'none',
  'null',
  'nil',
  'nan',
  'aucun',
  'inconnu',
  'unknown',
  'tbd',
  'tba',
  '-',
  '--',
  '---',
  '–',
  '—',
  '.',
  '..',
  '...',
  '?',
  '??',
  'x',
  'xx',
  'xxx',
]);

/**
 * Fewest digits a string must contain before it can plausibly be a number.
 *
 * Four, not the nine of a modern Cameroonian mobile: the register still carries
 * legitimate short landlines and abbreviated switchboard numbers, and refusing
 * to show one a patient could dial is a worse failure than showing one they
 * cannot. Every placeholder in the live data has zero digits, so this threshold
 * separates them cleanly.
 */
const MIN_DIGITS = 4;

/** Number of digit characters in a string. */
function digitCount(value: string): number {
  return value.replace(/\D/g, '').length;
}

/**
 * The number as it should be shown, or `null` when the field carries no usable
 * number. This is the single predicate: never test a phone field for
 * truthiness, ask this.
 *
 * @example
 * usablePhone('N/A')                // null  — 1 840 of 2 728 live rows
 * usablePhone('  ')                 // null
 * usablePhone('+237 222 20 18 00')  // '+237 222 20 18 00'
 */
export function usablePhone(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (PLACEHOLDERS.has(trimmed.toLowerCase().replace(/\s+/g, ''))) return null;
  if (digitCount(trimmed) < MIN_DIGITS) return null;
  return trimmed;
}

/** `true` when {@link usablePhone} would return a number. */
export function hasUsablePhone(value: string | null | undefined): boolean {
  return usablePhone(value) !== null;
}

/**
 * `tel:` URL for the first number in the field, or `null` when there is nothing
 * to dial.
 *
 * Returning `null` rather than a `tel:` string built from a placeholder is
 * deliberate: it makes the compiler force every caller to decide what to render
 * when a facility has no number, which is exactly the bug this module exists to
 * kill.
 *
 * A field holding several numbers (`"+237673026232,691890761"`, one live row)
 * dials the first — concatenating them would produce a number that reaches
 * nobody.
 */
export function telUrl(value: string | null | undefined): string | null {
  const usable = usablePhone(value);
  if (!usable) return null;
  // ` ou ` / ` or ` are how the register writes "call this, or this".
  const first = usable.split(/[,;/]|\s+ou\s+|\s+or\s+/i)[0] ?? usable;
  const dialable = (digitCount(first) >= MIN_DIGITS ? first : usable).replace(/[^+\d]/g, '');
  return dialable ? `tel:${dialable}` : null;
}
