/**
 * Page 24 — the Verification Centre.
 *
 * The one page of the passport that is not a reading surface: it is where a
 * patient proves the record is theirs and current, to someone standing in
 * front of them.
 *
 * ── THE QR IS A PRESENTATION, NOT A RECORD ────────────────────────────────
 *
 * Three rules from the package's security note, kept literally:
 *
 *   1. THE PAYLOAD IS OPAQUE. It carries a reference the server minted and
 *      nothing else. `assertOpaquePayload` refuses outright to render a code
 *      whose payload looks like it carries clinical content — a belt-and-brace
 *      check against a future change that starts encoding the record itself.
 *   2. IT IS SHORT LIVED. The code is minted on demand from the platform's own
 *      endpoint, counts down, and DISAPPEARS when it expires. A screenshot of
 *      an expired code proves nothing, which is the point.
 *   3. IT IS NOT THE AUTHORITY. Whether a credential is real is the server's
 *      answer at the moment of the check, never the artwork around it. The
 *      status indicator below shows what the server said; the frame is the
 *      brand's anti-copy language.
 *
 * The frame, glow and the eight indicator states are the canonical assets from
 * the OpesCare Secure visual library, already in this app and already used by
 * the Health ID card, so the passport and the card cannot drift apart.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/opes-ui';
import { CareButton } from '@/components/care/shared';
import { QrPanel } from '@/components/health-id/Layers';
import { HEALTH_ID_ART, HEALTH_ID_INDICATORS } from '@/components/health-id/assets';
import { useGenerateTemporaryQr } from '@/lib/api/queries';
import { passportColors as c, passportRadius as r } from './tokens';

/** The credential states the server reports, mapped to the library's indicators. */
type CredentialStatus = 'ACTIVE' | 'PROVISIONAL' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';

function indicatorFor(status: CredentialStatus, hasLiveCode: boolean) {
  if (status === 'REVOKED') return HEALTH_ID_INDICATORS.revoked;
  if (status === 'EXPIRED') return HEALTH_ID_INDICATORS.expired;
  if (status === 'SUSPENDED') return HEALTH_ID_INDICATORS.invalid;
  if (status === 'PROVISIONAL') return HEALTH_ID_INDICATORS.unknown;
  return hasLiveCode ? HEALTH_ID_INDICATORS.authentic : HEALTH_ID_INDICATORS.verified;
}

/**
 * Refuse to draw a code whose payload looks like it carries the record.
 * Ported from the package's `assertOpaqueQrPayload`, because the day someone
 * starts encoding a diagnosis into the presentation payload, this should fail
 * loudly rather than print it on a screen a stranger is pointing a camera at.
 */
export function assertOpaquePayload(payload: string): boolean {
  if (!payload || payload.length > 2048) return false;
  const forbidden = ['diagnosis', 'prescription', 'lab_result', 'allergy', 'address', 'password', 'api_key', 'access_token'];
  const lower = payload.toLowerCase();
  return !forbidden.some((word) => lower.includes(word));
}

export function VerificationCentre({ status }: { status: CredentialStatus }) {
  const { t } = useTranslation();
  const mint = useGenerateTemporaryQr();
  const [code, setCode] = useState<{ payload: string; expiresAt: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // The code counts itself down and removes itself; an expired code on screen
  // is worse than no code, because it still looks like proof.
  useEffect(() => {
    if (!code) return;
    const tick = () => {
      const left = Math.max(0, Math.round((code.expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setCode(null);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [code]);

  const present = useCallback(async () => {
    const minted = await mint.mutateAsync();
    const payload = minted.qr_payload ?? minted.verify_url;
    if (!assertOpaquePayload(payload)) return; // never render a leaky payload
    setCode({ payload, expiresAt: Date.now() + Math.max(1, minted.expires_in ?? 60) * 1000 });
  }, [mint]);

  const indicator = useMemo(() => indicatorFor(status, !!code), [status, code]);
  const statusLabel = t(`passport.verify.status.${status.toLowerCase()}`, {
    defaultValue: t('passport.verify.status.provisional'),
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.statusRow}>
        <Image source={indicator} style={styles.indicator} resizeMode="contain" accessibilityIgnoresInvertColors />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusLabel}>{statusLabel}</Text>
          <Text style={styles.statusHint}>{t('passport.verify.serverIsAuthority')}</Text>
        </View>
      </View>

      {code ? (
        <View style={styles.qrBlock}>
          <QrPanel
            value={code.payload}
            size={150}
            active
            background="#FFFFFF"
            foreground="#0A355C"
            logo={HEALTH_ID_ART.qrLogo}
            accessibilityLabel={t('passport.verify.qrLabel')}
          />
          <View style={styles.scanLine}>
            <Icon name="qr" size={13} color={c.teal} />
            <Text style={styles.scanText}>{t('passport.verify.opaqueReference')}</Text>
          </View>
          <Text style={styles.countdown}>
            {t('passport.verify.expiresIn', {
              seconds: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`,
            })}
          </Text>
          <Text style={styles.note}>{t('passport.verify.noClinicalData')}</Text>
        </View>
      ) : (
        <View style={styles.qrBlock}>
          <CareButton
            label={mint.isPending ? t('passport.verify.minting') : t('passport.verify.present')}
            icon="qr"
            loading={mint.isPending}
            onPress={() => void present()}
          />
          <Text style={styles.note}>
            {mint.isError ? t('passport.verify.mintFailed') : t('passport.verify.presentHint')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: r.lg,
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 14,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  indicator: { width: 40, height: 40 },
  statusLabel: { fontSize: 14, fontWeight: '900', color: c.text },
  statusHint: { marginTop: 2, fontSize: 11, color: c.textSecondary, lineHeight: 16 },
  // The frame's glow reaches ~18% beyond the panel, so the gap above it is
  // generous on purpose: less and the artwork sits on the status sentence.
  qrBlock: { marginTop: 30, alignItems: 'center', gap: 10 },
  scanLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scanText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8, color: c.teal },
  countdown: { fontSize: 12, fontWeight: '800', color: c.primary },
  note: { fontSize: 10.5, color: c.textSecondary, textAlign: 'center', lineHeight: 15, maxWidth: 260 },
});
