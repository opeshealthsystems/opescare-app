/**
 * Clinician — Scan a patient's Health ID code (`/clinician/scan`).
 *
 * The patient opens their Health ID (the card, or Presentation Mode) and the
 * clinician points the camera at it. The QR carries the public verifier URL;
 * the server turns it into exactly one patient and records the scan under a
 * reference the patient can see in their access log. From the match the
 * clinician either asks for access to the record (the consent request the
 * patient approves in their inbox) or, when this facility already holds a
 * grant, opens the chart straight away.
 *
 * What it is careful about:
 *   • ONE code at a time. The first decode locks the scanner until the server
 *     has answered, so a phone held over a code for two seconds does not
 *     record twenty verifications.
 *   • THE PHONE DECIDES NOTHING. Expired, withdrawn and foreign codes are
 *     refused by the server with an error_code; this screen only explains.
 *   • THERE IS ALWAYS A KEYBOARD PATH. The code (or a typed Health ID) can be
 *     entered by hand — for the web build in browsers without a barcode
 *     detector, for a broken camera, for a code read out over the phone.
 *   • NO ENUMERATION. A code names one patient or nobody; a typed Health ID
 *     goes through the same exact-match lookup as everywhere else.
 *
 * ── WHERE A CONFIRMED IDENTITY LEADS, PER ROLE ────────────────────────────
 * The hand-off is decided by the role's capabilities (`lib/staffCapabilities.ts`,
 * the mirror of config/staff_capabilities.php) and navigates BY PATH
 * (`components/doctor/chartRoutes.ts`), never by importing a desk screen —
 * the desks are built by other agents and may land after this file:
 *
 *   clinician (clinical_chart)   Open chart (grant held) · Ask for access (no grant)
 *   pharmacist (dispense)        Dispense for this patient → /clinician/pharmacy?health_id=…  · Ask for access
 *   receptionist (front_desk)    Check in / book → /clinician/desk/new-appointment?health_id=…
 *   lab (lab_results | sample_collection)   Lab orders for this patient → /clinician/lab?health_id=…
 *   anyone else                  the identity itself, worded for the role
 *
 * A button the server would refuse for the role is simply not drawn.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import {
  Card,
  Icon,
  PillInput,
  ScreenHeader,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock } from '@/components/care/shared';
import {
  ageFromDateOfBirth,
  isPlausibleHealthId,
  normaliseHealthId,
} from '@/lib/api/doctorQueries';
import { sexLabel } from '@/components/doctor/chartShared';
import { doctorRoutes } from '@/components/doctor/chartRoutes';
import {
  roleFamily,
  useHasProviderSession,
  useProviderRole,
  useStaffCapability,
  type RoleFamily,
} from '@/lib/staffCapabilities';
import {
  looksLikeHealthIdCode,
  scanFailureKind,
  useScanPatient,
  type ScanFailureKind,
  type ScanOutcome,
} from '@/lib/api/scanQueries';

type Phase = 'scanning' | 'resolving' | 'resolved' | 'failed';

const webHasBarcodeDetector = () =>
  Platform.OS !== 'web' || typeof (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector !== 'undefined';

export default function ScanPatientScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const tx = useCallback(
    (key: string, defaultValue: string, params?: Record<string, unknown>) =>
      String(t(`opesDoctor.scan.${key}`, { defaultValue, ...params })),
    [t]
  );

  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [failure, setFailure] = useState<ScanFailureKind | null>(null);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const locked = useRef(false);
  const scan = useScanPatient();

  const cameraUsable = webHasBarcodeDetector();

  // What this ROLE may do with a confirmed identity (`lib/staffCapabilities.ts`,
  // the mirror of the server's config/staff_capabilities.php). Identifying a
  // patient is open to every professional; the chart and the consent request
  // are not, and a button the server would refuse is simply not drawn.
  const canChart = useStaffCapability('clinical_chart');
  const canRequestAccess = useStaffCapability('request_access');
  const family = roleFamily(useProviderRole());
  // The desks, for a REAL provider session only — the same decision as the
  // tab bar's (`_layout.tsx`), so a hand-off never points at a tab the bar
  // does not have. The preview persona keeps the clinician's hand-offs.
  const realSession = useHasProviderSession();
  const holdsDispense = useStaffCapability('dispense');
  const holdsFrontDesk = useStaffCapability('front_desk');
  const holdsLab = useStaffCapability('lab_results', 'sample_collection');
  const canDispense = realSession && holdsDispense;
  const canFrontDesk = realSession && holdsFrontDesk;
  const canLab = realSession && holdsLab;

  const resolve = useCallback(
    (code: string) => {
      if (locked.current) return;
      locked.current = true;
      setPhase('resolving');
      setFailure(null);
      scan.mutate(code, {
        onSuccess: (res) => {
          setOutcome(res);
          setPhase('resolved');
        },
        onError: (err) => {
          setFailure(scanFailureKind(err));
          setPhase('failed');
        },
      });
    },
    [scan]
  );

  const onScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (phase !== 'scanning' || !result?.data) return;
      resolve(result.data);
    },
    [phase, resolve]
  );

  const reset = useCallback(() => {
    locked.current = false;
    setOutcome(null);
    setFailure(null);
    setManual('');
    setManualError(null);
    setPhase('scanning');
  }, []);

  // Coming back to this screen after a chart or a request starts fresh.
  useEffect(() => () => { locked.current = false; }, []);

  const submitManual = useCallback(() => {
    const text = manual.trim();
    if (text.length === 0) return;
    if (looksLikeHealthIdCode(text)) {
      setManualError(null);
      resolve(text);
      return;
    }
    if (isPlausibleHealthId(text)) {
      // A typed Health ID is not a code. For a clinician it goes through the
      // exact-match ask flow, pre-filled, like everywhere else in the app;
      // for every other role through the exact-match lookup on the Patients
      // tab, which offers that role's own hand-off (dispense, book, orders).
      setManualError(null);
      router.push(
        canChart && canRequestAccess
          ? doctorRoutes.requestAccess(normaliseHealthId(text))
          : doctorRoutes.patientLookup(normaliseHealthId(text)),
      );
      return;
    }
    setManualError(tx('manualInvalid', 'Paste the code from the patient’s QR, or type their full Health ID.'));
  }, [manual, resolve, router, tx, canChart, canRequestAccess]);

  const patient = outcome?.data ?? null;

  // Where a confirmed identity leads, for THIS role. The chart needs a grant
  // AND the capability; the ask needs no grant AND the capability; each desk
  // needs its capability; anything else ends on the identity itself, worded
  // for the role's actual work. Buttons are drawn in this order.
  const handOffs: HandOff[] = [];
  if (outcome && patient) {
    if (canChart && outcome.consent_granted) {
      handOffs.push({ key: 'chart', label: tx('openChart', 'Open chart'), icon: 'folder', route: doctorRoutes.patient(patient.id) });
    }
    if (canDispense) {
      handOffs.push({ key: 'dispense', label: tx('dispense', 'Dispense for this patient'), icon: 'pill', route: doctorRoutes.pharmacy(patient.health_id) });
    }
    if (canFrontDesk) {
      handOffs.push({ key: 'desk', label: tx('checkInBook', 'Check in / book'), icon: 'calendar-plus', route: doctorRoutes.deskNewAppointment(patient.health_id) });
    }
    if (canLab) {
      handOffs.push({ key: 'lab', label: tx('labOrders', 'Lab orders for this patient'), icon: 'flask', route: doctorRoutes.lab(patient.health_id) });
    }
    if (!outcome.consent_granted && canRequestAccess) {
      handOffs.push({ key: 'ask', label: tx('askAccess', 'Ask for access'), icon: 'key', route: doctorRoutes.requestAccess(patient.health_id) });
    }
  }
  // The notice above the buttons: the consent state for a role with the
  // chart, the role's own desk for everyone else.
  const noticeKind: 'consent' | 'desk' | 'identity' = canChart
    ? 'consent'
    : canDispense || canFrontDesk || canLab
      ? 'desk'
      : 'identity';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={tx('title', 'Scan a Health ID')}
        subtitle={tx('subtitle', 'Point the camera at the code the patient presents')}
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* ── The viewfinder ─────────────────────────────────────────────── */}
        {phase === 'scanning' && (
          <Card style={styles.viewfinderCard}>
            {!permission ? (
              <LoadingBlock label={tx('preparing', 'Preparing the camera…')} />
            ) : !permission.granted ? (
              <View style={styles.permission}>
                <Icon name="camera" size={34} color={colors.blue} />
                <Text style={styles.permissionTitle}>{tx('permissionTitle', 'Camera access needed')}</Text>
                <Text style={styles.permissionBody}>
                  {tx('permissionBody', 'OpesCare only uses the camera to read the patient’s Health ID code. Nothing is photographed or stored.')}
                </Text>
                <CareButton
                  label={tx('allowCamera', 'Allow camera')}
                  icon="camera"
                  onPress={() => void requestPermission()}
                  disabled={!permission.canAskAgain && Platform.OS !== 'web'}
                />
              </View>
            ) : !cameraUsable ? (
              <Notice
                icon="info"
                tone="warn"
                title={tx('webUnsupportedTitle', 'This browser cannot read codes')}
                body={tx('webUnsupportedBody', 'Use the OpesCare app on a phone, or paste the code below. Typing the patient’s Health ID works too.')}
                colors={colors}
              />
            ) : (
              <View style={styles.viewfinder}>
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={onScanned}
                />
                <View pointerEvents="none" style={styles.frame}>
                  <View style={[styles.corner, styles.tl]} />
                  <View style={[styles.corner, styles.tr]} />
                  <View style={[styles.corner, styles.bl]} />
                  <View style={[styles.corner, styles.br]} />
                </View>
                <View pointerEvents="none" style={styles.hintWrap}>
                  <Text style={styles.hint}>{tx('hint', 'Ask the patient to open their Health ID and hold it steady')}</Text>
                </View>
              </View>
            )}
          </Card>
        )}

        {phase === 'resolving' && (
          <Card style={styles.viewfinderCard}>
            <LoadingBlock label={tx('resolving', 'Checking the code with OpesCare…')} />
          </Card>
        )}

        {/* ── The match ─────────────────────────────────────────────────── */}
        {phase === 'resolved' && patient && outcome && (
          <Card>
            <View style={styles.matchHead}>
              <View style={styles.matchGlyph}>
                <Icon name="shield" size={22} color={colors.statusNormal} />
              </View>
              <View style={styles.matchText}>
                <Text style={styles.matchTitle}>{tx('matchedTitle', 'Health ID confirmed')}</Text>
                <Text style={styles.matchRef}>
                  {tx('recordedRef', 'Recorded under reference {{ref}}', { ref: outcome.verification.reference })}
                </Text>
              </View>
            </View>

            <View style={styles.holder}>
              <Text style={styles.holderName}>{patient.full_name?.trim() || patient.health_id}</Text>
              <Text style={styles.holderId}>{patient.health_id}</Text>
            </View>

            <View style={styles.facts}>
              <Fact label={tx('age', 'Age')} value={ageFromDateOfBirth(patient.date_of_birth)?.toString() ?? '—'} colors={colors} />
              <Fact label={tx('sex', 'Sex')} value={patient.sex ? sexLabel(patient.sex) : '—'} colors={colors} />
              <Fact label={tx('blood', 'Blood')} value={patient.blood_group ?? '—'} colors={colors} />
            </View>

            {noticeKind === 'consent' ? (
              <Notice
                icon={outcome.consent_granted ? 'check' : 'lock'}
                tone={outcome.consent_granted ? 'ok' : 'info'}
                title={outcome.consent_granted ? tx('accessGrantedTitle', 'Your facility has access') : tx('accessNotGrantedTitle', 'No access to this record yet')}
                body={
                  outcome.consent_granted
                    ? tx('accessGrantedBody', 'The patient has granted your facility access to their record. You can open the chart.')
                    : tx('accessNotGrantedBody', 'Ask the patient for access to the parts of their record you need — prescriptions, lab results, vitals. They approve it on their phone.')
                }
                colors={colors}
              />
            ) : noticeKind === 'desk' ? (
              // The role's own desk takes it from here. The chart is not
              // implied for a role that does not hold it.
              <Notice
                icon="check"
                tone="ok"
                title={tx('identifiedOnlyTitle', 'Identity confirmed')}
                body={deskBody({ canDispense, canFrontDesk, canLab }, tx)}
                colors={colors}
              />
            ) : (
              // Identity only. No "you can open the chart" for a role that
              // cannot, and no consent ask for one the server would refuse.
              <Notice
                icon="check"
                tone="ok"
                title={tx('identifiedOnlyTitle', 'Identity confirmed')}
                body={identifiedBody(family, tx)}
                colors={colors}
              />
            )}

            {/* The hand-offs, stacked — a role can have more than one. */}
            {handOffs.length > 0 && (
              <View style={styles.stack}>
                {handOffs.map((h, i) => (
                  <CareButton
                    key={h.key}
                    label={h.label}
                    icon={h.icon}
                    variant={i === 0 ? 'primary' : 'secondary'}
                    size="sm"
                    onPress={() => router.push(h.route)}
                  />
                ))}
              </View>
            )}
            <View style={styles.actions}>
              <CareButton
                label={tx('scanAgain', 'Scan another')}
                icon="qr"
                variant="secondary"
                style={styles.action}
                size="sm"
                onPress={reset}
              />
            </View>
          </Card>
        )}

        {/* ── A refusal ─────────────────────────────────────────────────── */}
        {phase === 'failed' && (
          <Card>
            <Notice
              icon={failure === 'expired' ? 'clock' : 'close'}
              tone={failure === 'offline' ? 'warn' : 'bad'}
              title={failureTitle(failure, tx)}
              body={failureBody(failure, tx)}
              colors={colors}
            />
            <View style={styles.actions}>
              <CareButton label={tx('scanAgain', 'Scan another')} icon="qr" style={styles.action} onPress={reset} />
            </View>
          </Card>
        )}

        {/* ── The keyboard path ─────────────────────────────────────────── */}
        {phase !== 'resolving' && (
          <Card>
            <Text style={styles.fieldLabel}>{tx('manualLabel', 'No camera? Enter it by hand')}</Text>
            <PillInput
              icon={<Icon name="qr" size={18} color={colors.blue} />}
              value={manual}
              onChangeText={(v) => {
                setManual(v);
                if (manualError) setManualError(null);
              }}
              onSubmitEditing={submitManual}
              placeholder={tx('manualPlaceholder', 'Paste the code, or type the Health ID')}
              error={manualError ?? undefined}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType="none"
              returnKeyType="go"
              accessibilityLabel={tx('manualLabel', 'No camera? Enter it by hand')}
            />
            <View style={styles.actions}>
              <CareButton
                label={tx('useCode', 'Use this')}
                icon="check"
                variant="secondary"
                style={styles.action}
                onPress={submitManual}
                disabled={manual.trim().length === 0}
              />
            </View>
            <Text style={styles.note}>
              {tx('noEnumeration', 'A code names one patient or nobody. There is no name search on any OpesCare surface.')}
            </Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One button under a confirmed identity: where THIS role takes the patient next. */
type HandOff = { key: string; label: string; icon: IconName; route: string };

/**
 * What a confirmed identity means for a role whose next step is its own desk
 * in this app. The chart is never implied for a role that does not hold it.
 */
function deskBody(
  caps: { canDispense: boolean; canFrontDesk: boolean; canLab: boolean },
  tx: (k: string, d: string) => string,
): string {
  if (caps.canFrontDesk) {
    return tx('identifiedFrontDeskBody', 'This is the person the Health ID names. Book or check them in from here — today’s book is in the Desk tab.');
  }
  if (caps.canDispense) {
    return tx('identifiedPharmacyBody', 'This is the person the Health ID names. Dispense against their prescriptions from here; their chart is not part of your role.');
  }
  return tx('identifiedLabBody', 'This is the person the Health ID names. Their laboratory orders are in the Lab tab; their chart is not part of your role.');
}

/**
 * What a confirmed identity means for a role that ends there — no chart, no
 * desk in this app. Honest about where the rest of the work lives.
 */
function identifiedBody(family: RoleFamily, tx: (k: string, d: string) => string): string {
  switch (family) {
    case 'pharmacyStock':
      return tx('identifiedStockBody', 'This is the person the Health ID names. Your role covers stock, in the Stock tab; dispensing and their chart are not part of it.');
    default:
      return tx('identifiedRoleBody', 'This is the person the Health ID names. Their chart is not part of your role.');
  }
}

function failureTitle(kind: ScanFailureKind | null, tx: (k: string, d: string) => string): string {
  switch (kind) {
    case 'not_a_code': return tx('notACodeTitle', 'Not a Health ID code');
    case 'expired':    return tx('expiredTitle', 'This code has expired');
    case 'revoked':    return tx('revokedTitle', 'The patient withdrew this code');
    case 'invalid':    return tx('invalidTitle', 'Code not recognised');
    case 'offline':    return tx('offlineTitle', 'Could not reach OpesCare');
    default:           return tx('unknownTitle', 'The code could not be checked');
  }
}

function failureBody(kind: ScanFailureKind | null, tx: (k: string, d: string) => string): string {
  switch (kind) {
    case 'not_a_code': return tx('notACodeBody', 'That QR is not an OpesCare Health ID. Ask the patient to open their Health ID in the OpesCare app.');
    case 'expired':    return tx('expiredBody', 'Presentation codes last 15 minutes. Ask the patient to present a new one.');
    case 'revoked':    return tx('revokedBody', 'The patient cancelled this code from their app. Ask them to present a new one.');
    case 'invalid':    return tx('invalidBody', 'This code does not match any live Health ID. It may have been altered or copied.');
    case 'offline':    return tx('offlineBody', 'Check the connection and scan again. Nothing was recorded.');
    default:           return tx('unknownBody', 'Something went wrong on our side. Scan again in a moment.');
  }
}

function Fact({ label, value, colors }: { label: string; value: string; colors: Palette }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: typography.fontFamily.semiBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted }}>{label}</Text>
      <Text style={{ fontFamily: typography.fontFamily.semiBold, fontSize: 15, color: colors.textPrimary, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function Notice({
  icon, tone, title, body, colors,
}: { icon: IconName; tone: 'info' | 'ok' | 'warn' | 'bad'; title: string; body: string; colors: Palette }) {
  const fill = {
    info: { bg: colors.primarySoft, fg: colors.link },
    ok:   { bg: colors.statusNormalBg, fg: colors.statusNormal },
    warn: { bg: colors.statusWarningBg, fg: colors.statusWarning },
    bad:  { bg: colors.statusCriticalBg, fg: colors.statusCritical },
  }[tone];
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: 14, backgroundColor: fill.bg, marginTop: spacing.md }}>
      <Icon name={icon} size={18} color={fill.fg} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: typography.fontFamily.semiBold, fontSize: 14, color: colors.textPrimary }}>{title}</Text>
        <Text style={{ fontFamily: typography.fontFamily.regular, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 2 }}>{body}</Text>
      </View>
    </View>
  );
}

const CORNER = 26;

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
    viewfinderCard: { padding: 0, overflow: 'hidden' },
    viewfinder: { width: '100%', aspectRatio: 1, backgroundColor: colors.navy ?? '#0E1729', position: 'relative' },
    camera: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
    frame: { position: 'absolute', top: '18%', left: '18%', right: '18%', bottom: '18%' },
    corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#FFFFFF' },
    tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
    tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
    bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
    br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
    hintWrap: { position: 'absolute', left: 0, right: 0, bottom: spacing.md, alignItems: 'center', paddingHorizontal: spacing.lg },
    hint: { color: '#FFFFFF', fontFamily: typography.fontFamily.medium, fontSize: 12, textAlign: 'center', backgroundColor: 'rgba(14,23,41,0.62)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    permission: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
    permissionTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: 16, color: colors.textPrimary, textAlign: 'center' },
    permissionBody: { fontFamily: typography.fontFamily.regular, fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },
    matchHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    matchGlyph: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.statusNormalBg, alignItems: 'center', justifyContent: 'center' },
    matchText: { flex: 1 },
    matchTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: 15, color: colors.statusNormal },
    matchRef: { fontFamily: typography.fontFamily.regular, fontSize: 12, color: colors.textMuted, marginTop: 1 },
    holder: { marginTop: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
    holderName: { fontFamily: typography.fontFamily.bold, fontSize: 18, color: colors.textPrimary },
    holderId: { fontFamily: typography.fontFamily.semiBold, fontSize: 14, letterSpacing: 1.2, color: colors.blue, marginTop: 2 },
    facts: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    action: { flex: 1 },
    stack: { gap: spacing.sm, marginTop: spacing.md },
    fieldLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: 13, color: colors.textPrimary, marginBottom: spacing.xs },
    note: { fontFamily: typography.fontFamily.regular, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: spacing.sm },
  });
