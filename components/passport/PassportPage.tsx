/**
 * One page of the Health Passport: the covers, and the data-driven pages.
 *
 * A record page renders exactly the sections the server built from the
 * patient's own records. When there are none, the caller shows the empty state
 * instead of this — an empty page says "nothing has been recorded here yet",
 * which is a fact about the record, not a gap in the app.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/opes-ui';
import { VerificationCentre } from './VerificationCentre';
import { passportColors as c, passportRadius as r, passportSpace as s } from './tokens';
import type { PassportPage, PassportSection } from '@/lib/api/passportQueries';

/** Page icons come from the server; anything unknown falls back to a document. */
export function glyph(name: string | undefined): IconName {
  const known: Record<string, IconName> = {
    'shield-check': 'shield-check', 'id-card': 'id-card', 'first-aid': 'first-aid',
    'document-text': 'document-text', 'alert-triangle': 'alert-triangle', pill: 'pill',
    activity: 'activity', 'calendar-check': 'calendar-check', building: 'building',
    flask: 'flask', image: 'image', 'heart-pulse': 'heart-pulse', 'arrow-right': 'arrow-right',
    'folder-plus': 'folder-plus', baby: 'baby', users: 'users', 'credit-card': 'credit-card',
    lock: 'lock', qr: 'qr', 'heart-rate': 'heart-rate', 'check-circle': 'check-circle',
    clipboard: 'clipboard',
  };
  return known[name ?? ''] ?? 'document-text';
}

export function PassportPageBody({
  page,
  status = 'PROVISIONAL',
}: {
  page: PassportPage;
  /** The credential status the summary reported, for the Verification Centre. */
  status?: 'ACTIVE' | 'PROVISIONAL' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
}) {
  if (page.kind === 'cover') return <Cover page={page} />;
  if (page.kind === 'back-cover') return <BackCover />;

  return (
    <View>
      {page.sections.map((section, i) => (
        <SectionCard key={`${page.id}-${i}`} section={section} />
      ))}

      {/* Page 24 is where the passport stops being a reading surface: the
          short-lived, opaque code a clinician actually scans. */}
      {page.id === 'verification' ? <VerificationCentre status={status} /> : null}
    </View>
  );
}

function SectionCard({ section }: { section: PassportSection }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Icon name="document-text" size={14} color={c.primary} />
        </View>
        <Text style={styles.cardTitle}>{section.title}</Text>
      </View>
      {section.items.map((item, i) => (
        <View key={`${item.label}-${i}`} style={[styles.row, i > 0 && styles.rowBorder]}>
          <Text style={styles.label}>{item.label}</Text>
          <View style={styles.valueWrap}>
            <Text
              style={[
                styles.value,
                item.tone === 'success' && { color: c.success },
                item.tone === 'warning' && { color: c.warning },
                item.tone === 'danger' && { color: c.danger },
              ]}
            >
              {item.value}
            </Text>
            {item.tone ? (
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      item.tone === 'success' ? c.success : item.tone === 'warning' ? c.warning : c.danger,
                  },
                ]}
              />
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function Cover({ page }: { page: PassportPage }) {
  const { t } = useTranslation();
  return (
    <View style={styles.cover}>
      <View style={styles.coverRing}>
        <Icon name="shield-check" size={44} color={c.surface} />
      </View>
      <Text style={styles.coverBrand}>OPESCARE</Text>
      <Text style={styles.coverTitle}>{t('passport.coverTitle').toUpperCase()}</Text>
      <Text style={styles.coverTag}>{t('passport.tagline')}</Text>
      <View style={styles.coverPanel}>
        <Text style={styles.panelTitle}>{page.subtitle}</Text>
        <Text style={styles.panelBody}>{t('passport.coverExplainer')}</Text>
      </View>
    </View>
  );
}

function BackCover() {
  const { t } = useTranslation();
  const pledges: Array<[IconName, string]> = [
    ['lock', t('passport.pledgeData')],
    ['shield-check', t('passport.pledgeControl')],
    ['users', t('passport.pledgePeople')],
    ['heart-pulse', t('passport.pledgeAfrica')],
  ];

  return (
    <View style={styles.back}>
      <Text style={styles.backKicker}>{t('passport.secure').toUpperCase()}</Text>
      <Text style={styles.backTitle}>{t('passport.backTitle')}</Text>
      <Text style={styles.backBody}>{t('passport.backBody')}</Text>
      <View style={styles.backGrid}>
        {pledges.map(([icon, label]) => (
          <View key={label} style={styles.backCell}>
            <Icon name={icon} size={17} color={c.teal} />
            <Text style={styles.backCellText}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: r.lg,
    backgroundColor: 'rgba(255,255,255,0.92)',
    padding: s.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 },
  cardIcon: {
    width: 26, height: 26, borderRadius: 9, backgroundColor: c.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { flex: 1, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', color: c.text, letterSpacing: 0.2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: c.border },
  label: { width: '40%', fontSize: 12, color: c.textSecondary, lineHeight: 17 },
  valueWrap: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 7 },
  value: { fontSize: 12, fontWeight: '700', color: c.text, textAlign: 'right', lineHeight: 17 },
  dot: { width: 6, height: 6, borderRadius: 99 },

  cover: { minHeight: 460, paddingVertical: 36, alignItems: 'center', justifyContent: 'center' },
  coverRing: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: c.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 4, borderColor: c.tealLight,
  },
  coverBrand: { fontSize: 32, fontWeight: '900', color: c.primary, letterSpacing: 0.5 },
  coverTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 3, color: c.text, marginTop: 4 },
  coverTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1, color: c.teal, marginTop: 12, textAlign: 'center' },
  coverPanel: {
    width: '100%', marginTop: 34, padding: 18, borderWidth: 1, borderColor: c.border,
    borderRadius: 18, backgroundColor: 'rgba(247,250,252,0.88)',
  },
  panelTitle: { fontSize: 14, fontWeight: '800', color: c.text },
  panelBody: { fontSize: 12, color: c.textSecondary, lineHeight: 18, marginTop: 7 },

  back: { minHeight: 460, paddingVertical: 30, justifyContent: 'space-between' },
  backKicker: { fontSize: 11, fontWeight: '900', letterSpacing: 2, color: c.teal },
  backTitle: { fontSize: 28, fontWeight: '900', color: c.primaryDark, lineHeight: 34, marginTop: 22 },
  backBody: { fontSize: 13, lineHeight: 20, color: c.textSecondary, marginTop: 20 },
  backGrid: { marginTop: 28, gap: 10 },
  backCell: {
    padding: 13, borderWidth: 1, borderColor: c.border, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.88)', flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  backCellText: { flex: 1, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: c.text },
});
