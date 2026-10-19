/**
 * The blocks the approved passport sheets are built from.
 *
 * Reading the generated designs, every page is assembled from the same small
 * set of pieces: a card whose heading carries a coloured disc, and inside it
 * either a ruled table, a row of counted tiles, a bulleted list, or a tinted
 * banner. The colour of the disc is information — red is the emergency and
 * allergy language of the document, green is "in order", purple is advice —
 * so it comes from the server with the section rather than being guessed here.
 *
 * The printed sheets set their tables in two columns on A4. A phone is one
 * column wide, and the package's own spec forbids reproducing the A4 spread
 * literally, so a table here keeps its headings and its ruling and scrolls
 * sideways inside its own card when the columns need more room than the screen
 * has. Nothing is dropped to make it fit: a clinician who cannot see the dose
 * column has been failed by the document.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/opes-ui';
import { passportColors as c, passportRadius as r } from './tokens';
import type { PassportAccent, PassportCell, PassportSection } from '@/lib/api/passportQueries';

/** The accent palette, as the sheets use it: disc fill, tint and heading ink. */
const ACCENTS: Record<PassportAccent, { ink: string; tint: string; rule: string }> = {
  blue: { ink: '#1D4ED8', tint: '#EFF6FF', rule: '#DBEAFE' },
  red: { ink: '#B91C1C', tint: '#FEF2F2', rule: '#FECACA' },
  green: { ink: '#047857', tint: '#ECFDF5', rule: '#A7F3D0' },
  amber: { ink: '#B45309', tint: '#FFFBEB', rule: '#FDE68A' },
  purple: { ink: '#6D28D9', tint: '#F5F3FF', rule: '#DDD6FE' },
  teal: { ink: '#0F766E', tint: '#F0FDFA', rule: '#99F6E4' },
};

/** Pill colours, matching the severity chips on the printed sheet. */
const PILLS = {
  success: { bg: '#DCFCE7', fg: '#166534', br: '#86EFAC' },
  warning: { bg: '#FEF3C7', fg: '#92400E', br: '#FCD34D' },
  danger: { bg: '#FEE2E2', fg: '#991B1B', br: '#FCA5A5' },
  caution: { bg: '#FEF9C3', fg: '#854D0E', br: '#FDE047' },
  neutral: { bg: '#E2E8F0', fg: '#334155', br: '#CBD5E1' },
} as const;

function accentOf(section: PassportSection) {
  return ACCENTS[section.accent ?? 'blue'] ?? ACCENTS.blue;
}

/** The heading every card carries: coloured disc, then the section name. */
export function SectionHead({ section }: { section: PassportSection }) {
  const a = accentOf(section);
  return (
    <View style={styles.head}>
      <View style={styles.disc}>
        <Icon name={(section.icon as IconName) ?? 'document-text'} size={24} color={a.ink} />
      </View>
      <Text style={[styles.headTitle, { color: a.ink }]} numberOfLines={2}>
        {section.title.toUpperCase()}
      </Text>
    </View>
  );
}

export function Pill({ tone, children }: { tone: keyof typeof PILLS; children: string }) {
  const p = PILLS[tone] ?? PILLS.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: p.bg, borderColor: p.br }]}>
      <Text style={[styles.pillText, { color: p.fg }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

/**
 * The design's ruled table. Column widths are shared evenly unless a column
 * needs more, and the whole grid scrolls sideways rather than truncating.
 */
function DataTable({ section }: { section: PassportSection }) {
  const a = accentOf(section);
  const columns = section.columns ?? [];
  const rows = section.rows ?? [];

  // Wide tables get a horizontal scroller; narrow ones fill the card. Four
  // columns is where a phone stops being able to show a readable cell.
  const scrolls = columns.length > 3;
  const minWidth = scrolls ? Math.max(320, columns.length * 108) : undefined;

  const grid = (
    <View style={[styles.table, minWidth ? { width: minWidth } : { alignSelf: 'stretch' }]}>
      <View style={[styles.tr, { backgroundColor: a.tint, borderColor: a.rule }]}>
        {columns.map((col, i) => (
          <Text key={i} style={[styles.th, { color: a.ink }, i === 0 && styles.firstCol]} numberOfLines={2}>
            {col}
          </Text>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={[styles.tr, styles.trBody, ri % 2 === 1 && styles.trAlt]}>
          {row.map((cell, ci) => (
            <Cell key={ci} cell={cell} first={ci === 0} />
          ))}
        </View>
      ))}
    </View>
  );

  if (!scrolls) return grid;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroller}>
      {grid}
    </ScrollView>
  );
}

function Cell({ cell, first }: { cell: PassportCell; first: boolean }) {
  if (cell.pill) {
    return (
      <View style={[styles.td, first && styles.firstCol, styles.tdPill]}>
        <Pill tone={cell.pill}>{cell.v}</Pill>
      </View>
    );
  }
  return (
    <Text style={[styles.td, first && styles.firstCol, first && styles.tdStrong]} numberOfLines={3}>
      {cell.v}
    </Text>
  );
}

/** The row of counted tiles the summary pages open with. */
function StatTiles({ section }: { section: PassportSection }) {
  const stats = section.stats ?? [];
  return (
    <View style={styles.tiles}>
      {stats.map((s, i) => {
        const ink =
          s.tone === 'danger'
            ? c.danger
            : s.tone === 'warning'
              ? c.warning
              : s.tone === 'success'
                ? c.success
                : c.primary;
        return (
          <View key={i} style={styles.tile}>
            <Text style={[styles.tileValue, { color: ink }]}>{s.value}</Text>
            <Text style={styles.tileLabel} numberOfLines={2}>
              {s.label.toUpperCase()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function BulletCard({ section }: { section: PassportSection }) {
  const a = accentOf(section);
  return (
    <View style={{ gap: 7 }}>
      {(section.lines ?? []).map((line, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.bulletDot, { backgroundColor: a.ink }]} />
          <Text style={styles.bulletText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

function CalloutCard({ section }: { section: PassportSection }) {
  const a = accentOf(section);
  return (
    <View style={[styles.callout, { backgroundColor: a.tint, borderColor: a.rule }]}>
      <View style={styles.calloutMark}>
        <Icon name={(section.icon as IconName) ?? 'check-circle'} size={24} color={a.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.calloutTitle, { color: a.ink }]}>{section.title.toUpperCase()}</Text>
        <Text style={styles.calloutBody}>{section.body}</Text>
      </View>
    </View>
  );
}

function FactList({ section }: { section: PassportSection }) {
  return (
    <View style={styles.factStack}>
      {section.items.map((item, i) => (
        <View key={`${item.label}-${i}`} style={styles.row}>
          <Text style={styles.label}>{item.label}</Text>
          <View style={styles.valueWrap}>
            {item.tone ? <Pill tone={item.tone}>{item.value}</Pill> : <Text style={styles.value}>{item.value}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * One section, drawn the way it asked to be drawn.
 *
 * A callout is its own banner and carries no card around it; everything else
 * sits in the design's white card with a coloured heading.
 */
export function SectionBlock({ section }: { section: PassportSection }) {
  const { t } = useTranslation();
  const layout = section.layout ?? 'list';

  if (layout === 'callout')
    return (
      <View style={{ marginTop: 14 }}>
        <CalloutCard section={section} />
      </View>
    );

  const empty =
    (layout === 'table' && (section.rows ?? []).length === 0) ||
    (layout === 'stats' && (section.stats ?? []).length === 0) ||
    (layout === 'bullets' && (section.lines ?? []).length === 0) ||
    (layout === 'list' && section.items.length === 0);

  return (
    <View style={styles.card}>
      <SectionHead section={section} />
      {empty ? (
        <Text style={styles.noRows}>{t('passport.blocks.no_rows')}</Text>
      ) : layout === 'table' ? (
        <DataTable section={section} />
      ) : layout === 'stats' ? (
        <StatTiles section={section} />
      ) : layout === 'bullets' ? (
        <BulletCard section={section} />
      ) : (
        <FactList section={section} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: r.lg,
    backgroundColor: 'rgba(255,255,255,0.94)',
    padding: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 10,
  },
  disc: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTitle: { flex: 1, fontSize: 11.5, fontWeight: '900', letterSpacing: 0.4 },

  scroller: { marginHorizontal: -2 },
  table: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: r.sm,
    overflow: 'hidden',
  },
  tr: { flexDirection: 'row', alignItems: 'stretch' },
  trBody: { borderTopWidth: 1, borderTopColor: c.border },
  trAlt: { backgroundColor: '#F8FAFC' },
  th: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 7,
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  td: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 7,
    fontSize: 10,
    color: c.textSecondary,
    lineHeight: 14,
  },
  tdStrong: { color: c.text, fontWeight: '700' },
  tdPill: { justifyContent: 'center', alignItems: 'flex-start' },
  firstCol: { flex: 1.25 },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 68,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: r.md,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  tileValue: { fontSize: 20, fontWeight: '900' },
  tileLabel: {
    marginTop: 3,
    fontSize: 6.5,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: c.muted,
    textAlign: 'center',
  },

  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  bulletText: { flex: 1, fontSize: 11, color: c.text, lineHeight: 16 },

  callout: {
    flexDirection: 'row',
    gap: 10,
    padding: 11,
    borderWidth: 1,
    borderRadius: r.lg,
  },
  calloutMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  calloutBody: { marginTop: 3, fontSize: 11, color: c.text, lineHeight: 16 },

  // Each fact is its own outlined card; facts never share a ruled container.
  factStack: { gap: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: r.md,
    backgroundColor: '#FFFFFF',
  },
  label: {
    width: '40%',
    fontSize: 11.5,
    color: c.textSecondary,
    lineHeight: 16,
  },
  valueWrap: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  value: {
    fontSize: 11.5,
    fontWeight: '700',
    color: c.text,
    textAlign: 'right',
    lineHeight: 16,
  },

  pill: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: r.pill,
    borderWidth: 1,
  },
  pillText: { fontSize: 8.5, fontWeight: '900', letterSpacing: 0.3 },

  noRows: { fontSize: 11, color: c.muted, fontStyle: 'italic' },
});
