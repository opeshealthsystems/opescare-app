/**
 * The furniture the approved passport pages repeat on every sheet.
 *
 * Reading the generated designs, four things recur on every page and none of
 * them is decoration:
 *
 *   THE RAIL        the patterned spine down the outer edge, carrying the
 *                   issuer's name vertically. On the printed document it is
 *                   where the pages are bound.
 *   THE HOLDER      patient id, name, date of birth and sex, repeated on EVERY
 *                   page. That repetition is the point: a clinician reading
 *                   page nineteen must not have to leaf back to page two to
 *                   check whose record they are holding.
 *   THE KICKER      the page's one-line purpose, set in caps under its title.
 *   THE FOOT BAND   the navy bar closing every page.
 *
 * All drawn natively. The reference sheets are A4 artwork and the package's own
 * spec forbids reproducing them literally on a phone — so the structure and the
 * hierarchy are reproduced, at a width a person can actually read.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/opes-ui';
import { passportColors as c, passportRadius as r } from './tokens';

/** The bound edge of the document. Decorative, so it is hidden from readers. */
export function PassportRail() {
  return (
    <View
      style={styles.rail}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <LinearGradient
        colors={[c.primaryDark, c.primary, '#C99A42', c.primary, c.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.railText} numberOfLines={1}>
        OPESCARE · A SAFER, HEALTHIER AFRICA
      </Text>
    </View>
  );
}

/**
 * Whose record this is — on every page, as the printed passport does it.
 * Anything the record does not carry is simply left out rather than filled in.
 */
export function HolderStrip({
  name,
  healthId,
  dateOfBirth,
  sex,
}: {
  name?: string | null;
  healthId?: string | null;
  dateOfBirth?: string | null;
  sex?: string | null;
}) {
  const { t, i18n } = useTranslation();

  const dob = dateOfBirth
    ? new Date(dateOfBirth).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const sexLabel = sex ? t(`passport.verify.sex.${sex.toLowerCase()}`, { defaultValue: sex }) : null;

  return (
    <View style={styles.holder}>
      <View style={styles.avatar}>
        <Icon name="person" size={20} color={c.primary} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.holderLabel}>{t('passport.holderLabel')}</Text>
        <Text style={styles.holderName} numberOfLines={1}>
          {name ?? healthId ?? ''}
        </Text>

        <View style={styles.holderFacts}>
          {healthId ? <Fact label={t('passport.healthIdLabel')} value={healthId} /> : null}
          {dob ? <Fact label={t('passport.dobLabel')} value={dob} /> : null}
          {sexLabel ? <Fact label={t('passport.sexLabel')} value={sexLabel} /> : null}
        </View>
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.factValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** The page's purpose, in the design's caps-and-dots style. */
export function PageKicker({ text }: { text: string }) {
  return (
    <Text style={styles.kicker} numberOfLines={2}>
      {text.toUpperCase()}
    </Text>
  );
}

/** The navy band that closes every page. */
export function FootBand() {
  const { t } = useTranslation();
  return (
    <View style={styles.footBand}>
      <Text style={styles.footBandText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {t('passport.footBand')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 14, overflow: 'hidden' },
  railText: {
    position: 'absolute',
    width: 400,
    left: -193,
    top: '50%',
    transform: [{ rotate: '-90deg' }],
    textAlign: 'center',
    fontSize: 6.5,
    fontWeight: '900',
    letterSpacing: 2.2,
    color: 'rgba(255,255,255,0.85)',
  },

  holder: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: r.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: c.primaryLight,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D5E7F3',
  },
  holderLabel: { fontSize: 7, fontWeight: '900', letterSpacing: 1.2, color: c.teal },
  holderName: { fontSize: 14, fontWeight: '900', color: c.text, marginTop: 1 },
  holderFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 5 },
  fact: { minWidth: 0 },
  factLabel: { fontSize: 6.5, fontWeight: '800', letterSpacing: 0.9, color: c.muted },
  factValue: { fontSize: 10, fontWeight: '800', color: c.primaryDark, marginTop: 1 },

  kicker: {
    marginTop: 6,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: c.teal,
  },

  footBand: {
    marginLeft: -24,
    marginRight: -16,
    marginBottom: -16,
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: c.primaryDark,
  },
  footBandText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
});
