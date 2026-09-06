/**
 * The security block every passport page carries along its foot.
 *
 * A secure document says four things on every page, not only on the page that
 * happens to be about verification:
 *
 *   THE SEAL       the issuer's mark, struck visibly rather than hidden in the
 *                  watermark — a seal nobody can see is not a seal.
 *   THE STATE      what the register said about this credential, using the
 *                  visual library's own indicator art (authentic, verified,
 *                  unknown, invalid, revoked, expired).
 *   THE TIMESTAMP  when the record behind these pages was last updated, and
 *                  when this copy was drawn. A document with no date cannot be
 *                  relied on, and a reader who cannot tell how fresh a record
 *                  is will assume it is current when it may not be.
 *   THE MICROTEXT  the anti-copy line, as on the printed passport.
 *
 * None of it is proof. The seal and the artwork are brand and anti-copy
 * language; the only thing that establishes a credential is the server's answer
 * at the moment of a check, which is what the indicator reports and what the
 * short-lived code on page 24 lets someone verify for themselves.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Art } from '@/components/health-id/Layers';
import { HEALTH_ID_ART, HEALTH_ID_INDICATORS } from '@/components/health-id/assets';
import { passportColors as c } from './tokens';

type CredentialStatus = 'ACTIVE' | 'PROVISIONAL' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';

function indicatorFor(status: CredentialStatus) {
  switch (status) {
    case 'REVOKED':
      return HEALTH_ID_INDICATORS.revoked;
    case 'EXPIRED':
      return HEALTH_ID_INDICATORS.expired;
    case 'SUSPENDED':
      return HEALTH_ID_INDICATORS.invalid;
    case 'PROVISIONAL':
      return HEALTH_ID_INDICATORS.unknown;
    default:
      return HEALTH_ID_INDICATORS.verified;
  }
}

/** "12 Aug 2026, 14:05" — a date a person reads, not an ISO string. */
function stamp(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SecurityFooter({
  status,
  healthId,
  lastUpdatedAt,
  pageNumber,
  totalPages,
}: {
  status: CredentialStatus;
  healthId?: string | null;
  lastUpdatedAt?: string | null;
  pageNumber: number;
  totalPages: number;
}) {
  const { t, i18n } = useTranslation();
  const updated = stamp(lastUpdatedAt, i18n.language);
  const drawn = stamp(new Date().toISOString(), i18n.language);

  return (
    <View style={styles.wrap}>
      <View style={styles.rule} />

      <View style={styles.row}>
        {/* The issuer's seal, visible. */}
        <Art source={HEALTH_ID_ART.seal} style={styles.seal} resizeMode="contain" opacity={0.95} />

        <View style={styles.middle}>
          <Text style={styles.secure}>{t('passport.secure')}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {healthId ?? t('passport.not_recorded', { defaultValue: '' })}
          </Text>

          {/* When the record moved, and when this copy was drawn. */}
          {updated ? (
            <Text style={styles.stampLine} numberOfLines={1}>
              {t('passport.updatedAt', { when: updated })}
            </Text>
          ) : null}
          {drawn ? (
            <Text style={styles.stampLine} numberOfLines={1}>
              {t('passport.drawnAt', { when: drawn })}
            </Text>
          ) : null}
        </View>

        {/* What the register says about this credential. */}
        <View style={styles.stateBlock}>
          <Image
            source={indicatorFor(status)}
            style={styles.indicator}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.stateText} numberOfLines={1}>
            {t(`passport.verify.status.${status.toLowerCase()}`, {
              defaultValue: t('passport.verify.status.provisional'),
            })}
          </Text>
        </View>
      </View>

      <Text style={styles.microtext} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {t('passport.microtext', { page: pageNumber, total: totalPages })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  rule: { height: 1, backgroundColor: c.border, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  seal: { width: 42, height: 42 },
  middle: { flex: 1, minWidth: 0 },
  secure: { fontSize: 11, fontWeight: '900', color: c.primary, letterSpacing: 0.3 },
  meta: { fontSize: 9.5, color: c.textSecondary, marginTop: 2, letterSpacing: 0.4 },
  stampLine: { fontSize: 8.5, color: c.muted, marginTop: 1.5, letterSpacing: 0.2 },
  stateBlock: { alignItems: 'center', gap: 3, maxWidth: 96 },
  indicator: { width: 26, height: 26 },
  stateText: { fontSize: 8, fontWeight: '900', color: c.teal, textAlign: 'center', letterSpacing: 0.3 },
  // Microtext is meant to be small, not clipped: it sizes to fit the line so
  // the page number at its end survives on a narrow phone.
  microtext: { marginTop: 10, fontSize: 6, color: c.muted, letterSpacing: 0.4, textAlign: 'center' },
});
