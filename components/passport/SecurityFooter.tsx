/**
 * The security block every passport page carries along its foot.
 *
 * The approved sheets close each page with the same panel: the document's own
 * number under a scannable code on the left, what the register says about the
 * credential beside it, and the issuer's seal and signature under both. A
 * secure document says these things on every page, not only on the page that
 * happens to be about verification:
 *
 *   THE CODE       a real Code 128 of the Health ID. Hospital scanners read
 *                  barcodes where they may not read QR, and a code that scans
 *                  to nothing would be a lie told exactly where someone relies
 *                  on it.
 *   THE STATE      what the register said about this credential, using the
 *                  visual library's own indicator art.
 *   THE TIMESTAMP  when the record behind these pages was last updated, and
 *                  when this copy was drawn. A reader who cannot tell how fresh
 *                  a record is will assume it is current when it may not be.
 *   THE SEAL       the issuer's mark, struck visibly rather than hidden in the
 *                  watermark — a seal nobody can see is not a seal.
 *
 * WHAT IS DELIBERATELY NOT HERE. The sheets print a "SCAN TO VERIFY" QR in this
 * panel. This build does not draw one, because nothing in this deployment mints
 * a stable, resolvable code for a passport page: the genuine short-lived code
 * lives on the Verification Centre page, where it is minted on demand and dies
 * on a countdown. A QR that scans to nothing — or to a page that can say
 * nothing about this document — would be worse than no QR at all, since the
 * whole point of the panel is that a stranger can check it.
 *
 * None of this is proof. The seal and the artwork are brand and anti-copy
 * language; the only thing that establishes a credential is the server's answer
 * at the moment of a check.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Art } from '@/components/health-id/Layers';
import { HEALTH_ID_ART, HEALTH_ID_INDICATORS } from '@/components/health-id/assets';
import { Barcode } from './Barcode';
import { passportColors as c, passportRadius as r } from './tokens';

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

      <View style={styles.panels}>
        {/* Left: the document's own number, under a code that scans to it. */}
        <View style={styles.docPanel}>
          {healthId ? <Barcode value={healthId} width={142} height={26} showValue={false} /> : null}
          <Text style={styles.docLabel}>{t('passport.blocks.document_id')}</Text>
          <Text style={styles.docValue} numberOfLines={1}>
            {healthId ?? '—'}
          </Text>
        </View>

        {/* Right: what the register says, and when. */}
        <View style={styles.statePanel}>
          <View style={styles.stateRow}>
            <Image
              source={indicatorFor(status)}
              style={styles.indicator}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.secure}>{t('passport.secure')}</Text>
              <Text style={styles.stateText} numberOfLines={1}>
                {t(`passport.verify.status.${status.toLowerCase()}`, {
                  defaultValue: t('passport.verify.status.provisional'),
                })}
              </Text>
            </View>
          </View>

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
      </View>

      {/* The issuer's mark and the line that names them, as the sheet sets it. */}
      <View style={styles.sign}>
        <Art source={HEALTH_ID_ART.seal} style={styles.seal} resizeMode="contain" opacity={0.95} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.signLabel}>{t('passport.blocks.authorised_by')}</Text>
          <Text style={styles.signName} numberOfLines={1}>
            {t('passport.blocks.authority')}
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

  panels: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  docPanel: {
    flexShrink: 1,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: r.md,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  docLabel: { marginTop: 6, fontSize: 6.5, fontWeight: '900', letterSpacing: 0.9, color: c.muted },
  docValue: { fontSize: 9, fontWeight: '800', color: c.primaryDark, letterSpacing: 0.4, marginTop: 1 },

  statePanel: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: r.md,
    backgroundColor: 'rgba(255,255,255,0.92)',
    padding: 9,
    justifyContent: 'center',
    gap: 3,
  },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  indicator: { width: 26, height: 26 },
  secure: { fontSize: 9.5, fontWeight: '900', color: c.primary, letterSpacing: 0.3 },
  stateText: { fontSize: 8.5, fontWeight: '900', color: c.teal, letterSpacing: 0.3, marginTop: 1 },
  stampLine: { fontSize: 8, color: c.muted, letterSpacing: 0.2 },

  sign: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 },
  seal: { width: 38, height: 38 },
  signLabel: { fontSize: 6.5, fontWeight: '900', letterSpacing: 0.9, color: c.muted },
  signName: { fontSize: 10, fontWeight: '800', color: c.primaryDark, marginTop: 1 },

  // Microtext is meant to be small, not clipped: it sizes to fit the line so
  // the page number at its end survives on a narrow phone.
  microtext: { marginTop: 10, fontSize: 6, color: c.muted, letterSpacing: 0.4, textAlign: 'center' },
});
