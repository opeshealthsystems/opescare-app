#!/usr/bin/env node
/**
 * nav-audit — reachability audit for the expo-router route tree.
 *
 *   node scripts/nav-audit.mjs            # human report, exit 1 on orphans
 *   node scripts/nav-audit.mjs --json     # machine-readable, same exit code
 *   node scripts/nav-audit.mjs --strict   # ALSO fail on dangling references
 *
 * WHAT IT ANSWERS
 *   "Is there a screen under app/ that nothing in this codebase navigates to?"
 *   A screen only reachable by typing its URL is a screen no user will find,
 *   and on native there is no URL bar at all — so an orphan is a dead feature.
 *
 * HOW IT WORKS
 *   1. Derive every route from the file tree (expo-router conventions).
 *   2. Extract every route-shaped string literal from the source, with
 *      comments stripped, plus the <Tabs.Screen name="…"> registrations that
 *      put a route in the tab bar.
 *   3. Match references to routes segment-by-segment and report the routes
 *      nothing pointed at.
 *
 * THE GROUP TRAP (the reason a naive version of this script lies)
 *   expo-router group segments — `(tabs)`, `(auth)` — are invisible in a URL:
 *   `app/(tabs)/home.tsx` serves `/home`. But they are perfectly legal *in a
 *   navigation call*, and this app writes them that way everywhere:
 *   `router.replace('/(auth)/welcome')`, `router.push('/(tabs)/records')`.
 *   So every route is matched against BOTH forms — the grouped path and the
 *   URL path. Comparing only one of them reports every tab and every auth
 *   screen as an orphan.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `--root <dir>` retargets the whole audit — used by the script's own
 *  fixture tests, and by anyone auditing a second app in the workspace. */
const rootFlag = process.argv.find((a) => a.startsWith('--root='))?.slice('--root='.length);
const ROOT = rootFlag
  ? resolve(process.cwd(), rootFlag)
  : resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const APP_DIR = join(ROOT, 'app');

/** Directories scanned for navigation references. Navigation is not confined
 *  to `app/` — the auth store redirects, and shared components push. */
const SOURCE_DIRS = ['app', 'components', 'lib'];

const SOURCE_EXT = /\.(tsx|ts|jsx|js|mjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.expo', '__tests__', '__mocks__']);

/**
 * Routes that are reachable without anything in the codebase linking to them,
 * so they must never be reported as orphans:
 *  - `/` is the launch URL — app/index.tsx is the first frame of a cold start.
 *  - `+not-found` / `+html` / `+native-intent` are framework hooks, filtered
 *    out earlier by the `+` rule; listed here as documentation.
 */
const ENTRY_ROUTES = new Set(['/']);

const args = new Set(process.argv.slice(2));
const AS_JSON = args.has('--json');
const STRICT = args.has('--strict');

// ── 1. Walk the file tree ──────────────────────────────────────────────────

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out);
    } else if (SOURCE_EXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** `app/(tabs)/health-id.tsx` → ['(tabs)', 'health-id'] */
function fileSegments(file) {
  return relative(APP_DIR, file).split(sep).join('/').replace(SOURCE_EXT, '').split('/');
}

const isGroup = (s) => s.startsWith('(') && s.endsWith(')');
const isDynamic = (s) => s.startsWith('[') && s.endsWith(']');
const isCatchAll = (s) => s.startsWith('[...') && s.endsWith(']');

/** A file is a route unless it is a layout, a framework file, or a test. */
function isRouteFile(file) {
  const segments = fileSegments(file);
  const leaf = segments[segments.length - 1];
  if (segments.some((s) => s.startsWith('_'))) return false; // _layout, _utils
  if (segments.some((s) => s.startsWith('+'))) return false; // +not-found, +html
  if (/\.(test|spec)$/.test(leaf) || leaf.endsWith('.d')) return false;
  return true;
}

/**
 * Both addressable forms of one route:
 *   grouped — as written in a navigation call: /(tabs)/health-id
 *   url     — as it appears in the address bar:  /health-id
 * A trailing `index` collapses into its directory in both.
 */
function routeForms(segments) {
  const trimmed = segments[segments.length - 1] === 'index' ? segments.slice(0, -1) : segments;
  const grouped = trimmed;
  const url = trimmed.filter((s) => !isGroup(s));
  return {
    grouped,
    url,
    groupedPath: '/' + grouped.join('/'),
    urlPath: '/' + url.join('/'),
  };
}

const routes = walk(APP_DIR)
  .filter(isRouteFile)
  .map((file) => {
    const segments = fileSegments(file);
    const forms = routeForms(segments);
    return {
      file: relative(ROOT, file).split(sep).join('/'),
      segments,
      ...forms,
      dynamic: segments.some(isDynamic),
      referencedBy: new Set(),
    };
  })
  .sort((a, b) => a.urlPath.localeCompare(b.urlPath));

// ── 2. Extract navigation references ───────────────────────────────────────

/**
 * Strip comments so a route named in a JSDoc block ("navigates to /family")
 * does not count as a navigation. Runs a small scanner rather than a regex,
 * because `'http://x'` and `str.replace(/[\s-]/g, '')` both contain sequences
 * a regex-based stripper mangles.
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i += 1;
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
    } else if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < n) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** Every `'…'`, `"…"` or `` `…` `` literal whose value starts with `/`. */
const STRING_LITERAL = /'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;

/**
 * Does this literal sit in a position that navigates? Reachability itself does
 * NOT depend on this — every route-shaped literal is credited, because a
 * missed reference would invent an orphan, which is the one failure mode a CI
 * gate cannot have. It exists only to keep the *dangling* report readable:
 * without it the list is 90 API endpoints from `lib/api/endpoints.ts`, none of
 * which was ever meant to be a screen.
 */
const NAVIGATIONAL = [
  // Any receiver, not just `router`: screens destructure it as `r`, and
  // helpers take it as a parameter.
  /\b[A-Za-z_$][\w$]*\s*\.\s*(?:push|replace|navigate|dismissTo|prefetch)\s*\(\s*$/,
  /\bhref\s*[:=]\s*\{?\s*$/,
  /\b(?:route|destination|pathname|screen|target)\s*:\s*$/,
];
const isNavigational = (before) => NAVIGATIONAL.some((re) => re.test(before));

/** `import … from './wrong-app'` inside a _layout. */
const IMPORT_FROM = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;

/**
 * `<Tabs.Screen name="records" …>` — a tab-bar slot IS how a user reaches that
 * screen, so it counts as a reference, resolved against the layout's own
 * directory. `href: null` hides the screen from the bar, so it does not.
 * Stack.Screen is deliberately excluded: registering screen options on a stack
 * is not a navigation affordance.
 */
const TAB_SCREEN = /<Tabs\.Screen\b([^>]*)\/?>/g;
const SCREEN_NAME = /name\s*=\s*["'`]([^"'`]+)["'`]/;
const HREF_NULL = /href\s*:\s*null/;

/** Normalize one reference into comparable segments. `${…}` becomes `*`. */
function refSegments(raw) {
  const cleaned = raw
    .split('?')[0]
    .split('#')[0]
    .replace(/\$\{[^}]*\}/g, '*')
    .replace(/\/+$/, '');
  if (!cleaned.startsWith('/')) return null;
  const segments = cleaned.slice(1).split('/').filter(Boolean);
  return segments;
}

const references = []; // { raw, segments, from, navigational }

function addReference(raw, from, navigational) {
  const segments = refSegments(raw);
  if (segments === null) return;
  references.push({ raw, segments, from, navigational });
}

/** Resolve an import specifier to a file in `routeByFile`, or null. */
const routeByFile = new Map(routes.map((r) => [r.file, r]));

function resolveImport(specifier, fromFile) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;
  const base = specifier.startsWith('@/')
    ? resolve(ROOT, specifier.slice(2))
    : resolve(join(fromFile, '..'), specifier);
  for (const candidate of [
    base,
    ...['.tsx', '.ts', '.jsx', '.js'].map((ext) => base + ext),
    ...['.tsx', '.ts', '.jsx', '.js'].map((ext) => join(base, 'index' + ext)),
  ]) {
    try {
      if (!statSync(candidate).isFile()) continue;
    } catch {
      continue;
    }
    const rel = relative(ROOT, candidate).split(sep).join('/');
    if (routeByFile.has(rel)) return rel;
  }
  return null;
}

const sourceFiles = SOURCE_DIRS.flatMap((dir) => walk(join(ROOT, dir)));

for (const file of sourceFiles) {
  const rel = relative(ROOT, file).split(sep).join('/');
  let src;
  try {
    src = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const code = stripComments(src);

  for (const match of code.matchAll(STRING_LITERAL)) {
    const value = match[1] ?? match[2] ?? match[3];
    if (!value || !value.startsWith('/')) continue;
    const before = code.slice(Math.max(0, match.index - 64), match.index);
    addReference(value, rel, isNavigational(before));
  }

  if (/[/\\]_layout\.[jt]sx?$/.test(file)) {
    const layoutDir = relative(APP_DIR, join(file, '..')).split(sep).join('/');

    // A tab-bar slot IS an entry point. `href: null` hides it, so it is not.
    for (const tag of code.matchAll(TAB_SCREEN)) {
      const attrs = tag[1];
      if (HREF_NULL.test(attrs)) continue;
      const name = attrs.match(SCREEN_NAME)?.[1];
      if (!name) continue;
      addReference('/' + [layoutDir, name].filter(Boolean).join('/'), rel, true);
    }

    // A layout that IMPORTS a sibling route module is composing that screen
    // into the tree itself — expo-router's own guard pattern
    // (`if (!isDoctor) return <WrongAppScreen />` in app/clinician/_layout).
    // The screen is on the user's path even though no call pushes its route.
    // Deliberately restricted to layouts: `app/labs/request.tsx` also imports
    // `./index`, but only for shared helpers, and crediting that would let a
    // genuinely orphaned screen hide behind a helper import.
    for (const imported of code.matchAll(IMPORT_FROM)) {
      const target = resolveImport(imported[1], file);
      if (target && target !== rel) routeByFile.get(target).referencedBy.add(rel);
    }
  }
}

// ── 3. Match references to routes ──────────────────────────────────────────

/**
 * Score how well `ref` matches `pattern` (a route's segment list), or null for
 * no match. A literal hit scores higher than a dynamic one so that
 * `/labs/request` is credited to `labs/request.tsx` and not to `labs/[id].tsx`.
 * A `*` (an interpolated id) matches ONLY a dynamic segment — otherwise
 * `/labs/${id}` would mark every sibling literal route reachable.
 */
function score(ref, pattern) {
  let total = 0;
  let r = 0;
  for (let p = 0; p < pattern.length; p += 1) {
    const seg = pattern[p];
    if (isCatchAll(seg)) {
      if (r >= ref.length) return null;
      return total + 1; // swallows the rest
    }
    if (r >= ref.length) return null;
    const given = ref[r];
    if (isDynamic(seg)) {
      total += 1;
    } else if (given === '*') {
      return null; // an id can never stand in for a literal segment
    } else if (given === seg) {
      total += 3;
    } else {
      return null;
    }
    r += 1;
  }
  return r === ref.length ? total : null;
}

const dangling = [];

for (const ref of references) {
  let best = null;
  let bestScore = -1;
  for (const route of routes) {
    // Both forms, because a call may or may not spell the group segment out.
    const s = Math.max(
      score(ref.segments, route.grouped) ?? -1,
      score(ref.segments, route.url) ?? -1,
    );
    if (s > bestScore) {
      bestScore = s;
      best = route;
    }
  }
  if (!best || bestScore < 0) {
    if (ref.navigational) dangling.push(ref);
    continue;
  }
  // A screen linking to itself does not make itself reachable.
  if (best.file !== ref.from) best.referencedBy.add(ref.from);
}

const orphans = routes.filter(
  (route) => route.referencedBy.size === 0 && !ENTRY_ROUTES.has(route.urlPath),
);

// Dangling references are grouped and reported, but do not fail the build by
// default: screens land in this repo continuously, and a link written one
// commit before its target is a warning, not a regression.
const danglingByPath = new Map();
for (const ref of dangling) {
  if (!danglingByPath.has(ref.raw)) danglingByPath.set(ref.raw, new Set());
  danglingByPath.get(ref.raw).add(ref.from);
}

// ── 4. Report ──────────────────────────────────────────────────────────────

const failed = orphans.length > 0 || (STRICT && danglingByPath.size > 0);

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        routes: routes.length,
        references: references.length,
        orphans: orphans.map((r) => ({ route: r.urlPath, grouped: r.groupedPath, file: r.file })),
        dangling: [...danglingByPath].map(([target, from]) => ({ target, from: [...from] })),
        ok: !failed,
      },
      null,
      2,
    ),
  );
  process.exit(failed ? 1 : 0);
}

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));

console.log('nav-audit — expo-router reachability');
console.log('='.repeat(72));
console.log(`routes discovered    ${routes.length}`);
console.log(
  `navigation refs      ${references.length}  (${references.filter((r) => r.navigational).length} in an explicit navigation call)`,
);
console.log(`orphaned screens     ${orphans.length}`);
console.log(`dangling targets     ${danglingByPath.size}`);
console.log('');

if (orphans.length > 0) {
  console.log('ORPHANS — a route exists but nothing navigates to it');
  console.log('-'.repeat(72));
  const width = Math.max(...orphans.map((r) => r.urlPath.length));
  for (const route of orphans) {
    const alias = route.groupedPath === route.urlPath ? '' : `  (aka ${route.groupedPath})`;
    console.log(`  ${pad(route.urlPath, width)}  ${route.file}${alias}`);
  }
  console.log('');
  console.log('  Fix: give the screen an entry point (a row, a tab, a CTA) — or');
  console.log('  delete it. A screen reachable only by URL does not exist on native.');
  console.log('');
}

if (danglingByPath.size > 0) {
  console.log(`DANGLING${STRICT ? '' : ' (warning)'} — navigated to, but no route file matches`);
  console.log('-'.repeat(72));
  const targets = [...danglingByPath].sort((a, b) => a[0].localeCompare(b[0]));
  const width = Math.max(...targets.map(([target]) => target.length));
  for (const [target, from] of targets) {
    console.log(`  ${pad(target, width)}  from ${[...from].join(', ')}`);
  }
  console.log('');
}

if (!failed) console.log('OK — every screen under app/ has at least one way in.');

process.exit(failed ? 1 : 0);
