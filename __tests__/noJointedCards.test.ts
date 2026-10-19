/**
 * Guard: no "jointed" cards.
 *
 * Two <Card>s stacked in the same column with nothing between them render as
 * one fused slab (the owner's "Privacy & data" bug). Every card stack must get
 * its rhythm from somewhere explicit: a `CardStack`, a parent whose style has
 * `gap`/`rowGap`, or a margin on the card itself.
 *
 * This statically scans app/** and components/** with the TypeScript compiler
 * API. It is a heuristic, not a layout engine: it flags
 *   - two adjacent <Card> JSX siblings, and
 *   - a `.map(...)` that returns a <Card> directly,
 * whose effective parent (fragments are looked through) has no gap in its
 * `style` / `contentContainerStyle`, when neither card carries a margin.
 *   - a single <Card> holding two or more row components (`ListRow`,
 *     `ToggleRow`, `InfoRow`, any `*Row`), tappable or not, or a `.map(...)`
 *     that produces rows inside one card: give each row its own card inside
 *     a <CardStack spacing="sm"> (owner's rule: nothing is jointed),
 *   - any `*Row` rendered with a truthy `divider` prop (a hairline between
 *     items), and
 *   - an `ItemSeparatorComponent` that draws a line (hairline, border, a
 *     1pt-high view or a Divider) instead of a plain gap.
 * Style references are resolved by key (`styles.foo` -> any `foo: {...}`
 * object literal in the same file).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components'];
const CARD_TAGS = new Set(['Card']);
const STACK_TAGS = new Set(['CardStack', 'ResultList']);

function walk(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
}

function tagName(n: ts.Node): string | null {
  if (ts.isJsxElement(n)) return n.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(n)) return n.tagName.getText();
  return null;
}

function attrs(n: ts.Node): ts.JsxAttributes | null {
  if (ts.isJsxElement(n)) return n.openingElement.attributes;
  if (ts.isJsxSelfClosingElement(n)) return n.attributes;
  return null;
}

function attrText(n: ts.Node, names: string[]): string {
  const a = attrs(n);
  if (!a) return '';
  return a.properties
    .filter((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && names.includes(p.name.getText()))
    .map((p) => (p.initializer ? p.initializer.getText() : ''))
    .join(' ');
}

/** key -> concatenated property names of every `key: { ... }` in the file. */
function styleIndex(sf: ts.SourceFile): Map<string, string> {
  const idx = new Map<string, string>();
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAssignment(n) && ts.isObjectLiteralExpression(n.initializer)) {
      const key = n.name.getText(sf);
      const props = n.initializer.properties.map((p) => (p.name ? p.name.getText(sf) : '')).join(',');
      idx.set(key, (idx.get(key) ?? '') + ',' + props);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // Styles split into a sibling module (`./styles`), imported directly or
  // handed down through a view-model hook.
  const specs = new Set(['./styles']);
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text;
      if (spec.startsWith('.') && /styles?$/i.test(spec)) specs.add(spec);
    }
  }
  for (const spec of specs) {
    for (const ext of ['.ts', '.tsx']) {
      const f = path.resolve(path.dirname(sf.fileName), spec + ext);
      if (!fs.existsSync(f)) continue;
      const other = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
      const v2 = (n: ts.Node) => {
        if (ts.isPropertyAssignment(n) && ts.isObjectLiteralExpression(n.initializer)) {
          const key = n.name.getText(other);
          const props = n.initializer.properties.map((p) => (p.name ? p.name.getText(other) : '')).join(',');
          idx.set(key, (idx.get(key) ?? '') + ',' + props);
        }
        ts.forEachChild(n, v2);
      };
      v2(other);
    }
  }
  return idx;
}

function styleHas(text: string, idx: Map<string, string>, re: RegExp): boolean {
  if (re.test(text)) return true; // inline object
  for (const m of text.matchAll(/\b\w+\.(\w+)/g)) {
    if (re.test(idx.get(m[1]) ?? '')) return true;
  }
  return false;
}

const GAP = /\b(gap|rowGap)\b/;
const MARGIN = /\b(margin|marginTop|marginBottom|marginVertical)\b/;

function isCard(n: ts.Node) {
  const t = tagName(n);
  return !!t && CARD_TAGS.has(t);
}

/** `{xs.map((x) => <Card .../>)}` or `(x) => (<Card>...)` */
function isCardMap(n: ts.Node): ts.Node | null {
  if (!ts.isJsxExpression(n) || !n.expression) return null;
  const e = n.expression;
  if (!ts.isCallExpression(e) || !ts.isPropertyAccessExpression(e.expression)) return null;
  if (e.expression.name.getText() !== 'map') return null;
  const fn = e.arguments[0];
  if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return null;
  let body: ts.Node = fn.body;
  while (ts.isParenthesizedExpression(body)) body = body.expression;
  if (ts.isBlock(body)) {
    const ret = body.statements.find(ts.isReturnStatement);
    if (!ret?.expression) return null;
    body = ret.expression;
    while (ts.isParenthesizedExpression(body)) body = body.expression;
  }
  return isCard(body) ? body : null;
}

/** Children with fragments flattened and whitespace text dropped. */
function children(n: ts.Node): ts.Node[] {
  const kids = ts.isJsxElement(n) || ts.isJsxFragment(n) ? n.children : ts.factory.createNodeArray<ts.JsxChild>();
  const out: ts.Node[] = [];
  for (const k of kids) {
    if (ts.isJsxText(k) && k.containsOnlyTriviaWhiteSpaces) continue;
    if (ts.isJsxExpression(k) && !k.expression) continue; // {/* comment */}
    if (ts.isJsxFragment(k)) out.push(...children(k));
    else out.push(k);
  }
  return out;
}

/** Any `*Row` or `*Tile` component: ListRow, ToggleRow, InfoRow, CountTile... */
const ROW = /^([A-Z]\w*Row|CountTile)$/;
const LINE = /hairline|borderBottomWidth|borderTopWidth|Divider|height:\s*(1\b|StyleSheet)/;

function hasDivider(n: ts.Node): boolean {
  const a = attrs(n);
  if (!a) return false;
  return a.properties.some(
    (p) =>
      ts.isJsxAttribute(p) &&
      p.name.getText() === 'divider' &&
      (!p.initializer || p.initializer.getText() !== '{false}'),
  );
}

/**
 * Row components inside a card, not descending into a nested Card. A row
 * produced by `.map(...)` counts as a list (2+) on its own.
 */
function rowsInCard(card: ts.Node): {
  count: number;
  mapped: boolean;
  nodes: ts.Node[];
} {
  const nodes: ts.Node[] = [];
  let mapped = false;
  const visit = (n: ts.Node, inMap: boolean) => {
    if (n !== card && isCard(n)) return;
    const t = tagName(n);
    if (t && ROW.test(t)) {
      nodes.push(n);
      if (inMap) mapped = true;
    }
    let nowInMap = inMap;
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.getText() === 'map'
    ) {
      nowInMap = true;
    }
    ts.forEachChild(n, (k) => visit(k, nowInMap));
  };
  visit(card, false);
  return {
    count: mapped ? Math.max(2, nodes.length) : nodes.length,
    mapped,
    nodes,
  };
}

export function scanFile(file: string, src = fs.readFileSync(file, 'utf8')): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const idx = styleIndex(sf);
  const problems: string[] = [];
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const spacedCard = (n: ts.Node) => styleHas(attrText(n, ['style']), idx, MARGIN);

  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) && isCard(n)) {
      const rows = rowsInCard(n);
      if (rows.count >= 2) {
        problems.push(
          `${rel}:${line(n)} JOINED ${rows.mapped ? 'a mapped list of' : rows.count} rows share one <Card>`,
        );
      }
    }
    {
      const t = tagName(n);
      if (t && ROW.test(t) && hasDivider(n)) {
        problems.push(`${rel}:${line(n)} <${t} divider> draws a hairline between items`);
      }
    }
    if (ts.isJsxAttribute(n) && n.name.getText() === 'ItemSeparatorComponent' && n.initializer) {
      if (LINE.test(n.initializer.getText())) {
        problems.push(`${rel}:${line(n)} ItemSeparatorComponent draws a line between items`);
      }
    }
    if (ts.isJsxElement(n)) {
      const tag = tagName(n)!;
      const parentSpaced = STACK_TAGS.has(tag) || styleHas(attrText(n, ['style', 'contentContainerStyle']), idx, GAP);
      if (!parentSpaced) {
        const kids = children(n);
        for (let i = 0; i < kids.length; i++) {
          const mapped = isCardMap(kids[i]);
          if (mapped && !spacedCard(mapped)) {
            problems.push(`${rel}:${line(kids[i])} <${tag}> maps a list of <Card>s with no gap`);
          }
          if (i > 0 && isCard(kids[i]) && isCard(kids[i - 1]) && !spacedCard(kids[i]) && !spacedCard(kids[i - 1])) {
            problems.push(`${rel}:${line(kids[i])} adjacent <Card>s inside <${tag}> with no gap`);
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return problems;
}

describe('no jointed cards', () => {
  it('flags adjacent cards in an unspaced column (self-test)', () => {
    const bad = `const A = () => (<View><Card /><Card /></View>);
      const B = () => (<View>{xs.map((x) => <Card key={x} />)}</View>);`;
    expect(scanFile(path.join(ROOT, 'app/x.tsx'), bad)).toHaveLength(2);
    const good = `const A = () => (<CardStack><Card /><Card /></CardStack>);
      const B = () => (<View style={styles.s}>{xs.map((x) => <Card key={x} />)}</View>);
      const styles = StyleSheet.create({ s: { gap: 12 } });`;
    expect(scanFile(path.join(ROOT, 'app/x.tsx'), good)).toEqual([]);
    const joined = `const C = () => (<Card variant="flush"><ListRow onPress={a} divider /><ListRow onPress={b} /></Card>);`;
    // two rows joined + a hairline on the first
    expect(scanFile(path.join(ROOT, 'app/x.tsx'), joined)).toHaveLength(2);
    const info = `const D = () => (<Card><InfoRow label="a" /><InfoRow label="b" /></Card>);
      const E = () => (<Card>{xs.map((x) => <FactRow key={x} />)}</Card>);
      const F = () => (<FlatList ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth }} />} />);`;
    expect(scanFile(path.join(ROOT, 'app/x.tsx'), info)).toHaveLength(3);
    const split = `const G = () => (<CardStack spacing="sm">{xs.map((x) => (<Card key={x} variant="flush"><ListRow divider={false} /></Card>))}</CardStack>);
      const H = () => (<FlatList ItemSeparatorComponent={() => <View style={{ height: 12 }} />} />);`;
    expect(scanFile(path.join(ROOT, 'app/x.tsx'), split)).toEqual([]);
  });

  it('has no adjacent <Card>s without spacing in app/** or components/**', () => {
    const files: string[] = [];
    for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);
    const problems = files.flatMap((f) => scanFile(f));
    if (problems.length) {
      throw new Error('Jointed cards (wrap them in <CardStack> or give the parent `gap`):\n  ' + problems.join('\n  '));
    }
  });
});
