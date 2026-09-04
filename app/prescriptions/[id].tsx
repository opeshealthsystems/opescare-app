import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import {
  Card,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  a11yJoin,
  formatDateTime,
  formatLabel,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import { Screen } from '../../components/ui/Screen';
import { useAuthStore } from '../../lib/store/auth';
import {
  usePrescriptionDetail,
  type PrescriptionDetail,
  type PrescriptionItemDetail,
} from '../../lib/api/queries';
import { useCatalogMedicineMatch } from '../../lib/api/prescriptionQueries';
import {
  EXPIRY_COUNTDOWN_MINUTES,
  grantExpiry,
  isSharingUnavailable,
  usePrescriptionAccess,
  useSharePrescription,
  useWithdrawPrescriptionAccess,
} from '../../lib/api/prescriptionAccessQueries';
import { formatXaf } from '../../lib/api/pharmacyQueries';
import {
  EXPIRY_WARNING_WINDOW_DAYS,
  daysUntil,
  referenceCode,
  statusLabelKey,
  fallbackStatusLabel,
} from '../../components/prescriptions/status';
import {
  ActionGrid,
  FactCell,
  LoadingBlock,
  MetricRow,
  TintCircle,
  VerifiedBanner,
  fmtShortDate,
  formIcon,
  prescriptionTone,
  routeLabel,
} from '../../components/meds/shared';

/**
 * One prescription in full — the header the care team issued, and every drug
 * line on it with its own dosage and its own dispensing outcome.
 *
 * MED-003 layout on the existing data layer (`usePrescriptionDetail`), with the
 * kit's own palette: a fillability notice when the prescription can no longer
 * be dispensed, the issuer hero card, the dispensing-progress card, a key-dates
 * `MetricRow` card, one flush card holding the numbered medications, the care
 * team's notes when there are any, the safety banner and the action grid.
 *
 * Four things this screen is deliberately careful about:
 *
 * 1. **Partial dispensing is a first-class state.** `partially_dispensed` on the
 *    header tells the patient *that* something is outstanding but never *what*.
 *    The progress card and the per-line badges answer that: a segment bar with
 *    one segment per drug line, a "3 of 5 collected" count, and a `StatusBadge`
 *    on every line carrying its own `status`, `dispensed_at` and
 *    `dispense_notes`.
 *
 * 2. **A retracted record is never shown as live.** `Prescription::
 *    TERMINAL_STATUSES` includes `voided`, `entered_in_error` and `amended`, and
 *    the shared `statusLabelKey` helper falls through to "Active" for all three
 *    — so those are named locally instead (see `usePrescriptionVocab`). Clinical
 *    events here are immutable: a cancelled drug line stays on the screen,
 *    struck through and labelled, rather than disappearing.
 *
 * 3. **Nothing is invented.** `GET /api/mobile/prescriptions/{id}` returns
 *    exactly: id, facility_name, status, status_color, item_count,
 *    prescribed_at, dispensed_at, expires_at, notes and items[]. There is no
 *    prescriber, no diagnosis, no refill counter, no assigned pharmacy and no
 *    PDF in that payload, so none of those appear here. Stock and price are not
 *    claimed either — the per-line row links into the Medicine Finder, which
 *    owns that question.
 *
 * 4. **Presenting is an act, not a display.** "Show to pharmacy" mints a
 *    revocable, expiring access token only when the patient taps it, shows the
 *    reference and a QR of the public verify URL, and is withheld entirely from
 *    a prescription that must not be dispensed — see `ShowToPharmacyCard`.
 */

/* -- Status vocabulary ------------------------------------------------------ */

/** `t` narrowed to the plain shape the helpers below take. */
type TFunc = (key: string, params?: Record<string, unknown>) => string;

/** Statuses from which no further transition is allowed (server-side truth). */
const TERMINAL_STATUSES = ['dispensed', 'cancelled', 'voided', 'entered_in_error', 'amended'];

/** Statuses that mean "this record should not have existed / no longer counts". */
const RETRACTED_STATUSES = ['voided', 'entered_in_error'];

/** The three per-line outcomes the API records, plus a bucket for anything new. */
type LineState = 'dispensed' | 'pending' | 'cancelled' | 'other';

function lineStateOf(item: PrescriptionItemDetail): LineState {
  // `status` is the authority; `is_dispensed` is the older boolean and only
  // stands in for a row written before the per-line status existed.
  const raw = (item.status || (item.is_dispensed ? 'dispensed' : 'pending')).toLowerCase();
  if (raw === 'dispensed' || raw === 'pending' || raw === 'cancelled') return raw;
  return 'other';
}

export default function PrescriptionDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const vocab = usePrescriptionVocab();

  // The reference prints a patient identity line above the medications, and a
  // pharmacist checking this at the counter needs it. It is read from the auth
  // store the session already holds — no extra request, and nothing here that
  // the signed-in patient does not already own.
  const patient = useAuthStore((s) => s.patient);

  const { data: prescription, isLoading, isError, isFetching, refetch } = usePrescriptionDetail(id);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/prescriptions'));

  const explainNoPdf = () =>
    dialog.show({
      title: t('opesMeds.prescription.noPdfTitle'),
      tone: 'info',
      cancelLabel: t('opesUi.components.close'),
      message: t('opesMeds.prescription.noPdfBody'),
    });

  const state = prescription ? readState(prescription) : null;

  /**
   * The share sheet is the offline copy this record has instead of a PDF, so it
   * carries the whole thing: status, dates, and every line with its dosage and
   * its own dispensing outcome. A prescription that can no longer be filled
   * says so in the text, because a pasted list of drugs has no colour to read.
   */
  async function share(rx: PrescriptionDetail, s: ReturnType<typeof readState>) {
    const lines = rx.items ?? [];
    const message = [
      vocab.tx('opesMeds.prescription.shareHeading', { reference: referenceCode(rx.id) }),
      rx.facility_name ? `${t('prescriptions.issuedBy')}: ${rx.facility_name}` : '',
      `${t('opesMeds.prescription.status')}: ${vocab.statusLabel(rx.status)}`,
      rx.prescribed_at ? `${t('prescriptions.prescribedAt')}: ${fmtShortDate(rx.prescribed_at)}` : '',
      rx.expires_at
        ? vocab.tx(s.expired ? 'prescriptions.expiredOn' : 'prescriptions.expiresOn', {
            date: fmtShortDate(rx.expires_at),
            defaultValue: s.expired ? 'Expired {{date}}' : 'Expires {{date}}',
          })
        : '',
      '',
      ...lines.map((item, index) => {
        const how = [item.dose, item.frequency, item.route ? routeLabel(item.route) : null]
          .filter(Boolean)
          .join(', ');
        const extra = [
          item.duration_days != null
            ? t('prescriptions.durationDays', { count: item.duration_days })
            : null,
          item.quantity != null ? `${t('prescriptions.quantity')}: ${item.quantity}` : null,
          vocab.lineLabel(lineStateOf(item), item.status),
        ]
          .filter(Boolean)
          .join(' · ');
        return `${index + 1}. ${item.drug_name}${how ? ` — ${how}` : ''}${extra ? `\n   ${extra}` : ''}`;
      }),
      rx.notes ? `\n${t('prescriptions.notes')}: ${rx.notes}` : '',
      s.fillable
        ? ''
        : `\n${vocab.tx('prescriptions.shareNotFillable', {
            defaultValue: 'This prescription can no longer be dispensed.',
          })}`,
    ]
      .filter((part) => part !== '')
      .join('\n');
    try {
      await Share.share({ message });
    } catch {
      // Share sheet dismissed, or no share target on this platform (web).
    }
  }

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('prescriptions.detailTitle')}
        subtitle={t('opesMeds.prescription.subtitle')}
        onBack={goBack}
        actions={[
          {
            icon: 'download',
            accessibilityLabel: t('opesMeds.prescription.downloadA11y'),
            onPress: explainNoPdf,
          },
        ]}
      />

      {isLoading ? (
        <LoadingBlock label={t('opesMeds.prescription.loading')} />
      ) : isError ? (
        // A request that failed. Retryable, and never confused with "no such
        // prescription" — the two need different words and different actions.
        <View style={styles.content}>
          <Card>
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('prescriptions.detailLoadError')}
              message={vocab.tx('prescriptions.detailLoadErrorBody', {
                defaultValue:
                  'The prescription could not be fetched. Check your connection and try again.',
              })}
              actionLabel={t('prescriptions.retry')}
              onAction={() => refetch()}
            />
          </Card>
        </View>
      ) : !prescription ? (
        // Loaded fine, but there is nothing under this id for this patient.
        <View style={styles.content}>
          <Card>
            <EmptyState
              icon="document-text"
              tint="amber"
              title={t('prescriptions.notFound')}
              message={vocab.tx('prescriptions.notFoundBody', {
                defaultValue:
                  'This prescription is not in your record. It may belong to another Health ID.',
              })}
              actionLabel={t('prescriptions.showAll')}
              onAction={() => router.replace('/prescriptions')}
            />
          </Card>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={() => refetch()}
              tintColor={colors.blue}
            />
          }
        >
          {/* The first thing on the screen when the record is no longer live —
              before the patient reads a dose off a prescription they cannot
              actually fill. */}
          <FillabilityNotice prescription={prescription} state={state!} />

          <IssuerCard
            prescription={prescription}
            state={state!}
            patient={patient ? { name: patient.display_name, healthId: patient.health_id } : null}
          />

          {/* Which lines are filled and which are not — the answer the header
              status alone cannot give. */}
          <DispensingCard prescription={prescription} state={state!} />

          {/* How the patient actually hands this over at a counter. Sits high
              on the screen because it is the one thing here that is done
              standing in a pharmacy rather than read at home. */}
          <ShowToPharmacyCard prescription={prescription} state={state!} />

          {/* Key dates. The facility is deliberately not repeated here — the
              card above already carries it as the prescription's attribution. */}
          <Card>
            <MetricRow
              icon="calendar"
              label={t('prescriptions.prescribedAt')}
              value={
                prescription.prescribed_at
                  ? fmtShortDate(prescription.prescribed_at)
                  : t('prescriptions.notRecorded')
              }
              divider
            />
            {prescription.dispensed_at ? (
              <MetricRow
                icon="check-circle"
                label={t('prescriptions.dispensedAt')}
                value={fmtShortDate(prescription.dispensed_at)}
                valueColor={colors.statusNormal}
                divider
              />
            ) : null}
            <MetricRow
              icon={state!.expired ? 'alert-triangle' : 'clock'}
              label={t('prescriptions.expiresAt')}
              value={
                prescription.expires_at
                  ? state!.expired
                    ? vocab.tx('prescriptions.expiredOn', {
                        date: fmtShortDate(prescription.expires_at),
                        defaultValue: 'Expired {{date}}',
                      })
                    : fmtShortDate(prescription.expires_at)
                  : t('prescriptions.noExpiry')
              }
              valueColor={state!.expired ? colors.statusCritical : undefined}
            />
          </Card>

          {/* Medications */}
          <Card variant="flush">
            <View style={styles.medHead}>
              <Icon name="pill" size={22} color={colors.blue} />
              <Text style={styles.medHeadTitle} accessibilityRole="header">
                {t('opesMeds.prescription.medicationsCount', {
                  count: (prescription.items ?? []).length,
                })}
              </Text>
            </View>

            {(prescription.items ?? []).length === 0 ? (
              <View style={styles.emptyItems}>
                <EmptyState icon="pill" tint="blue" title={t('prescriptions.noMedications')} />
              </View>
            ) : (
              (prescription.items ?? []).map((item, index) => (
                <MedicationItem
                  key={item.id}
                  item={item}
                  index={index + 1}
                  fillable={state!.fillable}
                  divider={index < (prescription.items ?? []).length - 1}
                />
              ))
            )}
          </Card>

          {/* Only rendered when the care team actually wrote something. The
              standing "take as prescribed" line lives in the safety banner
              below and is not passed off as a note from the clinician. */}
          {prescription.notes ? (
            <Card>
              <View style={styles.notesRow}>
                <Icon name="clipboard" size={22} color={colors.blue} />
                <View style={styles.notesBody}>
                  <Text style={styles.notesTitle}>{t('prescriptions.notes')}</Text>
                  <Text style={styles.notesText}>{prescription.notes}</Text>
                </View>
              </View>
            </Card>
          ) : null}

          {/* "Important" callout — carried over from the reference verbatim in
              intent: this is the one message that must survive any redesign. */}
          <VerifiedBanner
            icon="shield-check"
            title={t('prescriptions.safetyTitle')}
            message={t('prescriptions.safetyBody')}
          />

          <ActionGrid
            columns={3}
            actions={[
              {
                // The destination is the same Medicine Finder either way; only
                // the promise changes. Calling this "Fulfil at Pharmacy" on an
                // expired or retracted prescription would be a lie.
                icon: state!.fillable ? 'store' : 'search',
                label: state!.fillable
                  ? t('opesMeds.prescription.actionFulfil')
                  : t('prescriptions.emptyFindMedicine'),
                onPress: () => router.push('/pharmacy'),
              },
              {
                icon: 'download',
                label: t('opesMeds.prescription.actionDownload'),
                onPress: explainNoPdf,
              },
              {
                icon: 'share',
                label: t('opesMeds.prescription.actionShare'),
                onPress: () => share(prescription, state!),
              },
            ]}
          />
        </ScrollView>
      )}

      {dialog.element}
    </Screen>
  );
}

/* -- Derived state ---------------------------------------------------------- */

type RxState = {
  /** Whole days until `expires_at`; null when the record carries no expiry. */
  daysLeft: number | null;
  /** The expiry date is in the past. */
  lapsed: boolean;
  /** Status says expired, or the date has passed while the status lagged. */
  expired: boolean;
  /** Voided or entered-in-error — a record that must not be acted on. */
  retracted: boolean;
  /** Superseded by a later prescription. */
  amended: boolean;
  cancelled: boolean;
  /** The whole prescription is marked dispensed. */
  dispensed: boolean;
  /** No further clinical transition is possible. */
  terminal: boolean;
  /** A pharmacy could still dispense against this. Mirrors `isDispensable()`. */
  fillable: boolean;
  /** Approaching expiry, worth a warning badge (only while still fillable). */
  expiringInDays: number | null;
  counts: { total: number; dispensed: number; pending: number; cancelled: number; other: number };
  /** Some lines collected, some not — regardless of what the header says. */
  partial: boolean;
};

/**
 * Everything the screen decides from the payload, computed once.
 *
 * Expiry is checked against the date as well as the status: a nightly sweep can
 * lag, and a prescription still flagged `active` whose `expires_at` was
 * yesterday is expired in every way that matters at a pharmacy counter.
 */
function readState(rx: PrescriptionDetail): RxState {
  const items = rx.items ?? [];
  const status = (rx.status ?? '').toLowerCase();

  const daysLeft = daysUntil(rx.expires_at);
  const lapsed = daysLeft !== null && daysLeft < 0;
  const expired = status === 'expired' || lapsed;
  const retracted = RETRACTED_STATUSES.includes(status);
  const terminal = TERMINAL_STATUSES.includes(status);

  const counts = items.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[lineStateOf(item)] += 1;
      return acc;
    },
    { total: 0, dispensed: 0, pending: 0, cancelled: 0, other: 0 },
  );

  const fillable = !terminal && !expired;

  return {
    daysLeft,
    lapsed,
    expired,
    retracted,
    amended: status === 'amended',
    cancelled: status === 'cancelled',
    dispensed: status === 'dispensed',
    terminal,
    fillable,
    expiringInDays:
      fillable && daysLeft !== null && daysLeft >= 0 && daysLeft <= EXPIRY_WARNING_WINDOW_DAYS
        ? daysLeft
        : null,
    counts,
    // Outstanding lines alongside collected ones. Derived from the lines rather
    // than trusted from `status`, so it stays right when a pharmacy has filled
    // part of an order the header still calls `active`.
    partial: counts.dispensed > 0 && counts.pending > 0,
  };
}

/* -- Vocabulary hook -------------------------------------------------------- */

/**
 * Localized status words for this screen.
 *
 * `components/prescriptions/status.tsx` maps only the five statuses the filter
 * row offers and returns `prescriptions.statusActive` for everything else — so
 * a `voided` prescription would read "Active". That file is shared and not
 * edited here; the statuses it misses are named below instead, and a status
 * nobody has seen yet falls back to its own formatted value rather than
 * borrowing a word that would make a dead record look live.
 */
function usePrescriptionVocab() {
  const { t } = useTranslation();

  const tx = useCallback<TFunc>(
    (key, params) => String(t(key, params as Record<string, unknown>)),
    [t],
  );

  const statusLabel = useCallback(
    (status: string): string => {
      switch ((status ?? '').toLowerCase()) {
        case 'active':
        case 'dispensed':
        case 'partially_dispensed':
        case 'expired':
        case 'cancelled':
          return tx(statusLabelKey(status) ?? '') || fallbackStatusLabel(status);
        case 'voided':
          return tx('prescriptions.statusVoided', { defaultValue: 'Voided' });
        case 'entered_in_error':
          return tx('prescriptions.statusEnteredInError', { defaultValue: 'Entered in error' });
        case 'amended':
          return tx('prescriptions.statusAmended', { defaultValue: 'Amended' });
        case 'draft':
          return tx('prescriptions.statusDraft', { defaultValue: 'Draft' });
        default:
          return formatLabel(status);
      }
    },
    [tx],
  );

  const lineLabel = useCallback(
    (state: LineState, raw: string): string => {
      switch (state) {
        case 'dispensed':
          return tx('prescriptions.itemDispensed');
        case 'pending':
          return tx('prescriptions.itemPending');
        case 'cancelled':
          return tx('prescriptions.statusCancelled');
        default:
          return formatLabel(raw);
      }
    },
    [tx],
  );

  return useMemo(() => ({ tx, statusLabel, lineLabel }), [tx, statusLabel, lineLabel]);
}

/** Badge tone for a whole prescription, with the retracted statuses promoted. */
function headerTone(rx: PrescriptionDetail, state: RxState): StatusTone {
  if (state.retracted) return 'critical';
  if (state.amended) return 'warning';
  return prescriptionTone(rx.status, rx.status_color);
}

/**
 * Badge tone for one drug line.
 *
 * `pending` is amber while the prescription can still be filled — it is a thing
 * left to do — and neutral once it cannot, because then there is no action left
 * and amber would only nag.
 */
function lineTone(state: LineState, fillable: boolean): StatusTone {
  switch (state) {
    case 'dispensed':
      return 'normal';
    case 'cancelled':
      return 'critical';
    case 'pending':
      return fillable ? 'warning' : 'neutral';
    default:
      return 'neutral';
  }
}

const LINE_ICON: Record<LineState, IconName> = {
  dispensed: 'check-circle',
  pending: 'clock',
  cancelled: 'x-circle',
  other: 'info',
};

/* -- Pieces ---------------------------------------------------------------- */

/**
 * The banner that says a prescription cannot be dispensed, and why.
 *
 * Rendered above everything else, and only when it has something to say — a
 * live, in-date prescription gets no banner at all. A fully dispensed one gets
 * a positive note rather than a warning, because nothing is wrong with it.
 */
function FillabilityNotice({
  prescription,
  state,
}: {
  prescription: PrescriptionDetail;
  state: RxState;
}) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const vocab = usePrescriptionVocab();

  const notice = ((): { tone: StatusTone; icon: IconName; title: string; body: string } | null => {
    if (state.retracted) {
      return {
        tone: 'critical',
        icon: 'alert-triangle',
        title: vocab.tx('prescriptions.notFillableRetractedTitle', {
          defaultValue: 'This prescription was retracted',
        }),
        body: vocab.tx('prescriptions.notFillableRetractedBody', {
          status: vocab.statusLabel(prescription.status),
          defaultValue:
            'Your care team marked this record as {{status}}. Do not act on it. It stays in your record because clinical records are never deleted.',
        }),
      };
    }
    if (state.cancelled) {
      return {
        tone: 'critical',
        icon: 'x-circle',
        title: vocab.tx('prescriptions.notFillableCancelledTitle', {
          defaultValue: 'This prescription was cancelled',
        }),
        body: vocab.tx('prescriptions.notFillableCancelledBody', {
          defaultValue:
            'It was withdrawn by your care team, so a pharmacy cannot dispense against it. It is kept here so your record stays complete.',
        }),
      };
    }
    if (state.amended) {
      return {
        tone: 'warning',
        icon: 'history',
        title: vocab.tx('prescriptions.notFillableAmendedTitle', {
          defaultValue: 'Replaced by a newer prescription',
        }),
        body: vocab.tx('prescriptions.notFillableAmendedBody', {
          defaultValue:
            'This version was amended. Use the newer prescription in your list — this one is kept only as history.',
        }),
      };
    }
    if (state.expired) {
      return {
        tone: 'critical',
        icon: 'alert-triangle',
        title: vocab.tx('prescriptions.notFillableExpiredTitle', {
          defaultValue: 'This prescription has expired',
        }),
        body: prescription.expires_at
          ? vocab.tx('prescriptions.notFillableExpiredBodyDated', {
              date: fmtShortDate(prescription.expires_at),
              defaultValue:
                'It ran out on {{date}}, so a pharmacy can no longer dispense against it. Ask your clinician for a new one.',
            })
          : vocab.tx('prescriptions.notFillableExpiredBody', {
              defaultValue:
                'A pharmacy can no longer dispense against it. Ask your clinician for a new one.',
            }),
      };
    }
    if (state.dispensed) {
      return {
        tone: 'normal',
        icon: 'check-circle',
        title: vocab.tx('prescriptions.fullyDispensedTitle', { defaultValue: 'Fully dispensed' }),
        body: vocab.tx('prescriptions.fullyDispensedBody', {
          defaultValue: 'Every medicine on this prescription has been collected.',
        }),
      };
    }
    if (state.partial) {
      return {
        tone: 'warning',
        icon: 'alert-circle',
        title: vocab.tx('prescriptions.partialNoticeTitle', { defaultValue: 'Partly collected' }),
        body: vocab.tx('prescriptions.partialNoticeBody', {
          done: state.counts.dispensed,
          left: state.counts.pending,
          defaultValue:
            '{{done}} of these medicines have been collected and {{left}} have not. The list below shows which is which.',
        }),
      };
    }
    return null;
  })();

  if (!notice) return null;
  const skin = statusMap[notice.tone];

  return (
    <View
      style={[styles.notice, { backgroundColor: skin.bg, borderColor: skin.fg }]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={a11yJoin(notice.title, notice.body)}
    >
      <Icon name={notice.icon} size={22} color={skin.fg} />
      <View style={styles.noticeBody}>
        <Text style={[styles.noticeTitle, { color: skin.fg }]}>{notice.title}</Text>
        <Text style={styles.noticeText}>{notice.body}</Text>
      </View>
    </View>
  );
}

/**
 * Issuing facility + reference + status. The facility is the only attribution
 * the mobile API returns — there is no prescriber name in the payload, so none
 * is shown.
 */
function IssuerCard({
  prescription,
  state,
  patient,
}: {
  prescription: PrescriptionDetail;
  state: RxState;
  patient: { name: string; healthId: string } | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const vocab = usePrescriptionVocab();

  const expiryLabel =
    state.expiringInDays === null
      ? null
      : state.expiringInDays === 0
        ? t('prescriptions.expiresToday')
        : t('prescriptions.expiresInDays', { count: state.expiringInDays });

  const facility = prescription.facility_name ?? t('prescriptions.unknownFacility');
  const reference = referenceCode(prescription.id);

  const status = (prescription.status ?? '').toLowerCase();
  // When the status word already IS "Expired", the dated label replaces it
  // rather than sitting beside it as a second badge saying the same thing. A
  // prescription the server still calls `active` past its date gets both.
  const statusIsExpired = status === 'expired';
  const expiredLabel = state.expired
    ? prescription.expires_at
      ? vocab.tx('prescriptions.expiredOn', {
          date: fmtShortDate(prescription.expires_at),
          defaultValue: 'Expired {{date}}',
        })
      : vocab.tx('prescriptions.statusExpired')
    : null;
  const badgeLabel =
    statusIsExpired && expiredLabel ? expiredLabel : vocab.statusLabel(prescription.status);

  return (
    <Card>
      <View style={styles.issuer}>
        <TintCircle icon="building" tint="blue" size={64} />
        <View style={styles.issuerBody}>
          <Text style={styles.label}>{t('prescriptions.issuedBy')}</Text>
          <Text style={styles.issuerName} numberOfLines={2}>
            {facility}
          </Text>
          <Text style={styles.link}>{t('prescriptions.reference', { code: reference })}</Text>
        </View>
      </View>

      <View style={styles.facts}>
        <FactCell
          icon="calendar"
          label={t('opesMeds.prescription.prescribedOn')}
          value={
            prescription.prescribed_at
              ? fmtShortDate(prescription.prescribed_at)
              : t('prescriptions.notRecorded')
          }
        />
        <FactCell
          icon="document-text"
          label={t('opesMeds.prescription.prescriptionId')}
          value={reference}
          divided
        />
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusPair}>
          <Text style={styles.statusKey}>{t('opesMeds.prescription.status')}</Text>
          <StatusBadge
            status={prescription.status}
            tone={statusIsExpired ? 'critical' : headerTone(prescription, state)}
            label={badgeLabel}
            size="sm"
          />
        </View>
        {expiredLabel && !statusIsExpired ? (
          <StatusBadge
            status="expired"
            tone="critical"
            icon="alert-triangle"
            label={expiredLabel}
            size="sm"
          />
        ) : expiryLabel ? (
          <StatusBadge status="due" tone="warning" icon="clock" label={expiryLabel} size="sm" />
        ) : null}
      </View>

      {patient ? (
        <View
          style={styles.patientRow}
          accessible
          accessibilityLabel={a11yJoin(
            t('opesMeds.prescription.patient'),
            patient.name,
            patient.healthId,
          )}
        >
          <TintCircle icon="person" tint="blue" size={40} />
          <View style={styles.patientBody}>
            <Text style={styles.label}>{t('opesMeds.prescription.patient')}</Text>
            <Text style={styles.patientName} numberOfLines={1}>
              {patient.name}
            </Text>
          </View>
          <Text style={styles.patientId} numberOfLines={1}>
            {patient.healthId}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Dispensing progress across the whole prescription.
 *
 * One bar segment per drug line, coloured by that line's own outcome, so
 * "partially dispensed" becomes a picture rather than a word: three green
 * segments and two amber ones read instantly, and the counts underneath say the
 * same thing for a screen reader. Skipped entirely when there are no lines to
 * count.
 */
function DispensingCard({
  prescription,
  state,
}: {
  prescription: PrescriptionDetail;
  state: RxState;
}) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const vocab = usePrescriptionVocab();
  const items = prescription.items ?? [];

  if (items.length === 0) return null;

  const { counts } = state;
  const headline = vocab.tx('prescriptions.dispensedOfTotal', {
    done: counts.dispensed,
    total: counts.total,
    defaultValue: '{{done}} of {{total}} collected',
  });

  const chips: { key: string; tone: StatusTone; icon: IconName; label: string }[] = [];
  if (counts.pending > 0) {
    chips.push({
      key: 'pending',
      tone: state.fillable ? 'warning' : 'neutral',
      icon: 'clock',
      label: vocab.tx('prescriptions.stillToCollect', {
        n: counts.pending,
        defaultValue: '{{n}} still to collect',
      }),
    });
  }
  if (counts.cancelled > 0) {
    chips.push({
      key: 'cancelled',
      tone: 'critical',
      icon: 'x-circle',
      label: vocab.tx('prescriptions.cancelledLines', {
        n: counts.cancelled,
        defaultValue: '{{n}} cancelled',
      }),
    });
  }
  if (counts.dispensed > 0) {
    chips.push({
      key: 'dispensed',
      tone: 'normal',
      icon: 'check-circle',
      label: vocab.tx('prescriptions.collectedLines', {
        n: counts.dispensed,
        defaultValue: '{{n}} collected',
      }),
    });
  }

  return (
    <Card>
      <SectionHeader
        variant="overline"
        title={vocab.tx('prescriptions.dispensingTitle', { defaultValue: 'Dispensing' })}
      />

      <View
        style={styles.progressHead}
        accessible
        accessibilityLabel={a11yJoin(headline, ...chips.map((c) => c.label))}
      >
        <Icon name="store" size={20} color={colors.blue} />
        <Text style={styles.progressValue}>{headline}</Text>
      </View>

      {/* One segment per line, in the order the prescription lists them, so a
          segment lines up with the numbered card further down. */}
      <View style={styles.bar} importantForAccessibility="no-hide-descendants">
        {items.map((item) => {
          const tone = lineTone(lineStateOf(item), state.fillable);
          return (
            <View
              key={item.id}
              style={[styles.barSegment, { backgroundColor: statusMap[tone].fg }]}
            />
          );
        })}
      </View>

      <View style={styles.chipRow}>
        {chips.map((chip) => (
          <StatusBadge
            key={chip.key}
            status={chip.key}
            tone={chip.tone}
            icon={chip.icon}
            label={chip.label}
            size="sm"
          />
        ))}
      </View>

      {prescription.dispensed_at ? (
        <Text style={styles.progressFoot}>
          {vocab.tx('prescriptions.lastDispensedOn', {
            date: fmtShortDate(prescription.dispensed_at),
            defaultValue: 'Last dispensed {{date}}',
          })}
        </Text>
      ) : null}
    </Card>
  );
}

/* -- Show to pharmacy ------------------------------------------------------- */

/**
 * The reference is read aloud and keyed in character by character, so it is set
 * in a mono face: the kit ships only Poppins, where `0`/`O` and `1`/`I` are
 * easy to confuse at a counter. Sizes, colours and spacing stay the kit's.
 */
const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** Large enough to scan off a phone held across a pharmacy counter. */
const SHARE_QR_SIZE = 188;

/**
 * The server-issued reference, e.g. `RX-4F2A-9C31`.
 *
 * `reference` is new on the API and not yet declared on `PrescriptionDetail`
 * (that interface lives in `lib/api/queries.ts`, which this screen does not
 * own), so it is read defensively. Missing or blank means this server has not
 * shipped it yet — and then no reference is shown here at all, rather than a
 * code derived on the device and passed off as one a pharmacy can look up.
 */
function serverReference(rx: PrescriptionDetail): string | null {
  const value = (rx as unknown as { reference?: unknown }).reference;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * "Show to pharmacy" — how the patient hands this prescription over.
 *
 * A printed sheet will carry a scannable code; this is the same thing from the
 * phone, so a patient without the paper is not stuck at the counter. Three
 * things it is careful about:
 *
 * 1. **Access is granted by a tap, never by opening the screen.** Nothing is
 *    fetched on mount. `POST /mobile/prescriptions/{id}/share` mints a
 *    revocable, expiring token only when the patient asks for it, and the
 *    result is held for the session so re-reading the screen does not mint a
 *    second one.
 *
 * 2. **The QR encodes the verify URL itself** — `verify_url`, verbatim, never a
 *    JSON blob wrapping it. A pharmacist's phone camera has to be able to open
 *    it with no app at all. The reference sits above it in mono for the case
 *    where nothing can scan.
 *
 * 3. **Nothing is offered that cannot be filled, and nothing is faked.** The
 *    section is withheld from a prescription `state.fillable` already rules out
 *    (voided, entered-in-error, cancelled, amended, expired, fully dispensed)
 *    and explains why instead. If the share endpoints are not on this server
 *    yet, the request settles on the 404 with no retry (`accessRetry`) and the
 *    section says so plainly — no spinner, no invented code.
 */
function ShowToPharmacyCard({
  prescription,
  state,
}: {
  prescription: PrescriptionDetail;
  state: RxState;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const vocab = usePrescriptionVocab();
  const dialog = useDialog();

  const id = prescription.id;
  const { data: grant } = usePrescriptionAccess(id);
  const share = useSharePrescription(id);
  const withdraw = useWithdrawPrescriptionAccess(id);

  // Ticks only while a grant with an expiry is on screen. Without it a token
  // that lapses while the patient is queuing would keep looking live until the
  // screen was reopened — and a QR that silently stopped working is worse at a
  // counter than no QR at all.
  const [now, setNow] = useState(() => Date.now());
  const expiry = grantExpiry(grant, now);
  useEffect(() => {
    // Stops itself once the token has lapsed — there is nothing left to count.
    if (!grant?.expires_at || expiry.expired) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [grant?.expires_at, expiry.expired]);

  const live = !!grant && !expiry.expired;
  const reference = grant?.reference ?? serverReference(prescription);

  const title = vocab.tx('prescriptions.shareTitle', { defaultValue: 'Show to pharmacy' });

  // ── A prescription that must not be dispensed is not presentable ─────────
  // `state.fillable` is the screen's single answer to "could a pharmacy act on
  // this?" — voided, entered-in-error, cancelled, amended, expired and fully
  // dispensed all fail it. Reasons are ordered exactly as the notice at the top
  // of the screen orders them, so the two never disagree.
  if (!state.fillable) {
    const reason = state.retracted
      ? vocab.tx('prescriptions.shareBlockedRetracted', {
          defaultValue:
            'This prescription was retracted by your care team, so it cannot be presented for dispensing.',
        })
      : state.cancelled
        ? vocab.tx('prescriptions.shareBlockedCancelled', {
            defaultValue:
              'This prescription was cancelled, so a pharmacy cannot dispense against it.',
          })
        : state.amended
          ? vocab.tx('prescriptions.shareBlockedAmended', {
              defaultValue:
                'This version was replaced by a newer prescription. Show that one instead.',
            })
          : state.expired
            ? vocab.tx('prescriptions.shareBlockedExpired', {
                defaultValue:
                  'This prescription has expired, so a pharmacy can no longer dispense against it.',
              })
            : state.dispensed
              ? vocab.tx('prescriptions.shareBlockedDispensed', {
                  defaultValue:
                    'Every medicine on this prescription has already been collected.',
                })
              : vocab.tx('prescriptions.shareBlockedGeneric', {
                  defaultValue: 'A pharmacy can no longer dispense against this prescription.',
                });

    const blockedTitle = vocab.tx('prescriptions.shareBlockedTitle', {
      defaultValue: 'Cannot be shown to a pharmacy',
    });

    return (
      <Card>
        <SectionHeader variant="overline" title={title} />
        <View
          style={styles.shareBlocked}
          accessible
          accessibilityLabel={a11yJoin(blockedTitle, reason)}
        >
          <Icon name="lock" size={22} color={colors.textMuted} />
          <View style={styles.shareBlockedBody}>
            <Text style={styles.shareBlockedTitle}>{blockedTitle}</Text>
            <Text style={styles.shareNote}>{reason}</Text>
          </View>
        </View>
      </Card>
    );
  }

  // ── Fillable: mint, present, withdraw ───────────────────────────────────
  const unavailable = share.isError && isSharingUnavailable(share.error);
  const failed = share.isError && !unavailable;

  const expiryLabel = !expiry.hasExpiry
    ? vocab.tx('prescriptions.shareNoExpiry', { defaultValue: 'No automatic expiry' })
    : expiry.at === null
      ? vocab.tx('prescriptions.shareExpiryUnknown', { defaultValue: 'Expiry unknown' })
      : expiry.minutesLeft === null || expiry.minutesLeft >= EXPIRY_COUNTDOWN_MINUTES
        ? vocab.tx('prescriptions.shareExpiresAt', {
            date: formatDateTime(expiry.at),
            defaultValue: 'Expires {{date}}',
          })
        : expiry.minutesLeft === 0
          ? vocab.tx('prescriptions.shareExpiresSoon', {
              defaultValue: 'Expires in under a minute',
            })
          : vocab.tx('prescriptions.shareExpiresInMinutes', {
              minutes: expiry.minutesLeft,
              defaultValue: 'Expires in {{minutes}} min',
            });

  const expiryTone: StatusTone =
    expiry.minutesLeft !== null && expiry.minutesLeft < EXPIRY_COUNTDOWN_MINUTES
      ? 'warning'
      : 'neutral';

  const confirmWithdraw = () =>
    dialog.confirm({
      title: vocab.tx('prescriptions.shareWithdrawTitle', { defaultValue: 'Withdraw access?' }),
      message: vocab.tx('prescriptions.shareWithdrawBody', {
        defaultValue:
          'The code and the link stop working straight away, and a pharmacy that has not dispensed yet will no longer be able to open this prescription. You can show it again whenever you need to.',
      }),
      confirmLabel: vocab.tx('prescriptions.shareWithdrawConfirm', { defaultValue: 'Withdraw' }),
      destructive: true,
      onConfirm: async () => {
        try {
          await withdraw.mutateAsync();
        } catch {
          // The grant is left on screen on purpose: telling a patient their
          // prescription is private again when the revoke never landed would
          // be the worst failure this section could have.
          dialog.alert(
            vocab.tx('prescriptions.shareWithdrawFailedTitle', {
              defaultValue: 'Access was not withdrawn',
            }),
            vocab.tx('prescriptions.shareWithdrawFailedBody', {
              defaultValue:
                'The code is still live. Check your connection and try withdrawing it again.',
            }),
          );
        }
      },
    });

  return (
    // The confirm sheet is a sibling of the card, not a child: `Card` clips its
    // children (`overflow: hidden`) and a modal has no business inside that.
    <>
      <Card>
        <SectionHeader variant="overline" title={title} />

        <View style={styles.shareBody}>
          {reference ? (
            <View
              style={styles.shareRef}
              accessible
              accessibilityLabel={a11yJoin(
                vocab.tx('prescriptions.shareRefLabel', { defaultValue: 'Reference' }),
                // Spoken character by character — this is a code a pharmacist
                // types in, not a word.
                reference.split('').join(' '),
              )}
            >
              <Text style={styles.shareRefLabel}>
                {vocab.tx('prescriptions.shareRefLabel', { defaultValue: 'Reference' })}
              </Text>
              <Text style={styles.shareRefValue} selectable>
                {reference}
              </Text>
              <Text style={styles.shareNote}>
                {vocab.tx('prescriptions.shareRefHint', {
                  defaultValue: 'Read this out if the pharmacist cannot scan.',
                })}
              </Text>
            </View>
          ) : null}

          {live && grant ? (
            <>
              <View
                style={styles.shareQrBox}
                accessible
                accessibilityLabel={vocab.tx('prescriptions.shareQrA11y', {
                  defaultValue: 'QR code that opens this prescription for a pharmacy',
                })}
              >
                {/* The URL itself, verbatim — a phone camera has to be able to
                    open it without this app. Never a JSON payload. */}
                <QRCode
                  value={grant.verify_url}
                  size={SHARE_QR_SIZE}
                  color={colors.textPrimary}
                  backgroundColor={colors.surface}
                />
              </View>

              <Text style={styles.shareHint}>
                {vocab.tx('prescriptions.shareScanHint', {
                  defaultValue: 'The pharmacy scans this, or opens the link it contains.',
                })}
              </Text>

              <View style={styles.shareExpiryRow}>
                <StatusBadge
                  status="access"
                  tone={expiryTone}
                  icon="clock"
                  label={expiryLabel}
                  size="sm"
                />
              </View>

              <ListRow
                icon="lock"
                tint="red"
                title={vocab.tx('prescriptions.shareWithdraw', { defaultValue: 'Withdraw access' })}
                subtitle={vocab.tx('prescriptions.shareWithdrawHint', {
                  defaultValue: 'The code and the link stop working straight away.',
                })}
                chevron={false}
                onPress={confirmWithdraw}
                style={styles.shareWithdrawRow}
              />
            </>
          ) : (
            <>
              <Text style={styles.shareIntro}>
                {grant
                  ? vocab.tx('prescriptions.shareLapsedIntro', {
                      defaultValue:
                        'The code you created has expired. Make a new one when you are at the counter.',
                    })
                  : vocab.tx('prescriptions.shareIntro', {
                      defaultValue:
                        'Create a code the pharmacy can scan or type in. It opens this prescription for them, and nothing else in your record.',
                    })}
              </Text>

              {unavailable || failed ? (
                <View
                  style={styles.shareProblem}
                  accessibilityLiveRegion="polite"
                  accessible
                >
                  <Icon
                    name={unavailable ? 'info' : 'alert-circle'}
                    size={18}
                    color={unavailable ? colors.textMuted : colors.statusCritical}
                  />
                  <Text style={styles.shareProblemText}>
                    {unavailable
                      ? vocab.tx('prescriptions.shareUnavailable', {
                          defaultValue:
                            'This server cannot create a pharmacy code yet. The pharmacy can still look this prescription up at their counter.',
                        })
                      : vocab.tx('prescriptions.shareFailed', {
                          defaultValue:
                            'The code could not be created. Check your connection and try again.',
                        })}
                  </Text>
                </View>
              ) : null}

              <GradientButton
                label={
                  grant
                    ? vocab.tx('prescriptions.shareAgain', { defaultValue: 'Create a new code' })
                    : title
                }
                icon="none"
                loading={share.isPending}
                disabled={unavailable}
                onPress={() => share.mutate()}
                accessibilityHint={vocab.tx('prescriptions.shareActionHint', {
                  defaultValue: 'Creates a code a pharmacy can use to open this prescription.',
                })}
              />
            </>
          )}

          {/* The standing promise, shown whether or not a code is live. */}
          <View style={styles.sharePrivacy}>
            <Icon name="shield-check" size={16} color={colors.textMuted} />
            <Text style={styles.shareNote}>
              {vocab.tx('prescriptions.shareNotice', {
                defaultValue:
                  'Showing this lets a pharmacy see this prescription. You can withdraw access at any time.',
              })}
            </Text>
          </View>
        </View>
      </Card>

      {dialog.element}
    </>
  );
}

/** A dosage value, or null when it is blank — blank must read "Not specified". */
function clean(value: string | null | undefined): string | null {
  return value && value.trim().length > 0 ? value : null;
}

/**
 * One drug line, in full.
 *
 * Every field the API sends for an item appears here: drug_name, drug_code,
 * dose, frequency, route, duration_days, quantity, status, dispensed_at and
 * dispense_notes. A blank dosage value reads "Not specified" rather than a dash
 * that could be mistaken for a zero.
 *
 * A cancelled line is retracted, not removed: it keeps its number and its place
 * in the list, but the name is struck through, the dosage block is dimmed, and
 * a note says it is no longer part of the prescription — so it can never be
 * read as a live instruction.
 */
function MedicationItem({
  item,
  index,
  fillable,
  divider,
}: {
  item: PrescriptionItemDetail;
  index: number;
  fillable: boolean;
  divider?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const vocab = usePrescriptionVocab();

  const state = lineStateOf(item);
  const cancelled = state === 'cancelled';
  const tone = lineTone(state, fillable);
  const label = vocab.lineLabel(state, item.status);
  const dispensedOn = item.dispensed_at ? fmtShortDate(item.dispensed_at) : null;

  const missing = t('prescriptions.notSpecified');
  const dose = clean(item.dose);
  const frequency = clean(item.frequency);
  const route = clean(item.route);
  const duration =
    item.duration_days != null
      ? t('prescriptions.durationDays', { count: item.duration_days })
      : null;
  const quantity = item.quantity != null ? String(item.quantity) : null;

  return (
    <View style={[styles.item, divider && styles.itemDivider]}>
      {/* Spoken as one unit: the number, the drug, and what happened to it.
          The dosage grid and the finder link below stay separately reachable —
          grouping those in too would bury the "how to take it" values. */}
      <View
        style={styles.itemHead}
        accessible
        accessibilityLabel={a11yJoin(
          `${index}. ${item.drug_name}`,
          item.drug_code ? t('prescriptions.drugCode', { code: item.drug_code }) : null,
          label,
          dispensedOn,
        )}
      >
        <View style={[styles.itemIndex, cancelled && styles.itemIndexOff]}>
          <Text style={styles.itemIndexText}>{index}</Text>
        </View>
        <TintCircle
          icon={formIcon({ dosage: item.dose, drug_name: item.drug_name })}
          tint={cancelled ? 'red' : 'blue'}
          size={52}
          square
        />
        <View style={styles.itemBody}>
          <Text style={[styles.itemName, cancelled && styles.itemNameOff]} numberOfLines={2}>
            {item.drug_name}
          </Text>
          {item.drug_code ? (
            <Text style={styles.itemCode}>
              {t('prescriptions.drugCode', { code: item.drug_code })}
            </Text>
          ) : null}
        </View>
        <View style={styles.itemStatus}>
          <StatusBadge
            status={item.status || state}
            tone={tone}
            label={label}
            icon={LINE_ICON[state]}
            size="sm"
          />
          {dispensedOn ? (
            <Text style={styles.itemMeta} numberOfLines={2}>
              {vocab.tx(
                state === 'cancelled'
                  ? 'prescriptions.itemUpdatedOn'
                  : 'prescriptions.itemCollectedOn',
                {
                  date: dispensedOn,
                  defaultValue:
                    state === 'cancelled' ? 'Updated {{date}}' : 'Collected {{date}}',
                },
              )}
            </Text>
          ) : null}
        </View>
      </View>

      {/* The safety-critical block. Deliberately the loudest thing on the card:
          how much and how often lead, then route, duration and quantity. */}
      <View style={[styles.dosage, cancelled && styles.dosageOff]}>
        <Text style={styles.dosageTitle}>{t('prescriptions.howToTake')}</Text>
        <View style={styles.itemFacts}>
          <FactCell
            icon="capsule"
            label={t('prescriptions.dose')}
            value={dose ?? missing}
            valueColor={dose ? undefined : colors.textMuted}
          />
          <FactCell
            icon="clock"
            label={t('prescriptions.frequency')}
            value={frequency ?? missing}
            valueColor={frequency ? undefined : colors.textMuted}
            divided
          />
        </View>
        <View style={[styles.itemFacts, styles.itemFactsNext]}>
          <FactCell
            icon="arrow-up-right"
            label={t('prescriptions.route')}
            value={route ? routeLabel(route) : missing}
            valueColor={route ? undefined : colors.textMuted}
          />
          <FactCell
            icon="calendar"
            label={t('prescriptions.duration')}
            value={duration ?? missing}
            valueColor={duration ? undefined : colors.textMuted}
            divided
          />
        </View>
        <View style={[styles.itemFacts, styles.itemFactsNext]}>
          <FactCell
            icon="receipt"
            label={t('prescriptions.quantity')}
            value={quantity ?? missing}
            valueColor={quantity ? undefined : colors.textMuted}
          />
        </View>
      </View>

      {cancelled ? (
        <View style={styles.retracted}>
          <Icon name="x-circle" size={16} color={colors.statusCritical} />
          <Text style={styles.retractedText}>
            {vocab.tx('prescriptions.itemCancelledNote', {
              defaultValue: 'Cancelled — no longer part of this prescription.',
            })}
          </Text>
        </View>
      ) : null}

      {item.dispense_notes ? (
        <View style={styles.dispenseNote}>
          <Text style={styles.dispenseNoteTitle}>{t('prescriptions.dispenseNotes')}</Text>
          <Text style={styles.dispenseNoteText}>{item.dispense_notes}</Text>
        </View>
      ) : null}

      {/* A cancelled line has nothing to go and buy, so it gets no finder link. */}
      {cancelled ? null : <FindNearbyRow drugName={item.drug_name} />}
    </View>
  );
}

/**
 * "Find this medicine nearby" — the bridge into the Medicine Finder.
 *
 * A prescription item carries free text, never a catalog id, so the drug name
 * is resolved against `GET /mobile/pharmacy/medicines` first. On a hit this
 * deep-links straight to `/pharmacy/[medicineId]` (which fills in its own
 * default search origin when lat/lng are omitted) and shows the real catalog
 * price floor and pharmacy count. On a miss it opens the Medicine Finder itself
 * rather than a dead end — and says so, instead of implying stock it has not
 * confirmed. Availability is never asserted on this screen.
 */
function FindNearbyRow({ drugName }: { drugName: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data: medicine, isPending } = useCatalogMedicineMatch(drugName);

  const price = medicine?.availability.price_min ?? null;
  const pharmacyCount = medicine?.availability.pharmacy_count ?? 0;

  const hint = medicine
    ? price != null && pharmacyCount > 0
      ? t('prescriptions.nearbyFrom', { price: formatXaf(price) ?? '', count: pharmacyCount })
      : t('prescriptions.nearbyInCatalog', { name: medicine.name })
    : t('prescriptions.nearbySearchInstead');

  return (
    <View style={styles.nearby}>
      <ListRow
        icon={medicine ? 'store' : 'search'}
        tint="green"
        title={t('prescriptions.findNearby')}
        subtitle={isPending ? t('prescriptions.nearbyChecking') : hint}
        onPress={() => {
          if (medicine) {
            router.push({
              pathname: '/pharmacy/[medicineId]',
              params: { medicineId: medicine.id },
            });
          } else {
            router.push('/pharmacy');
          }
        }}
        style={styles.nearbyRow}
      />
    </View>
  );
}

/* -- Styles ---------------------------------------------------------------- */

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

    label: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    link: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: c.link },

    // -- Fillability notice --------------------------------------------------
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      padding: spacing.md - 2,
      borderRadius: radii.md,
      borderLeftWidth: 4,
    },
    noticeBody: { flex: 1, minWidth: 0, gap: 3 },
    noticeTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
    noticeText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
    },

    // -- Issuer --------------------------------------------------------------
    issuer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    issuerBody: { flex: 1, minWidth: 0, gap: 2 },
    issuerName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: c.textPrimary,
    },
    facts: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: spacing.md,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.divider,
      marginHorizontal: -10,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: 12,
    },
    statusPair: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusKey: {
      overflow: 'hidden',
      borderRadius: radii.sm,
      backgroundColor: c.blue,
      color: c.textOnBrand,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    patientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: spacing.md,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    patientBody: { flex: 1, minWidth: 0, gap: 1 },
    patientName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    patientId: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    // -- Dispensing progress -------------------------------------------------
    progressHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    progressValue: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    bar: {
      flexDirection: 'row',
      gap: 3,
      marginTop: 12,
      height: 8,
      borderRadius: radii.pill,
      overflow: 'hidden',
    },
    barSegment: { flex: 1, borderRadius: radii.pill },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    progressFoot: {
      marginTop: 10,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    // -- Show to pharmacy ----------------------------------------------------
    shareBody: { gap: 12, marginTop: 12 },
    shareIntro: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
    },
    shareNote: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
    },
    shareRef: {
      alignItems: 'center',
      gap: 4,
      borderRadius: radii.md,
      backgroundColor: c.primarySoft,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    shareRefLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.blue,
    },
    // The one thing on this card a pharmacist may have to key in by hand, so
    // it is the largest text on it and set in a mono face.
    shareRefValue: {
      fontFamily: MONO_FONT,
      fontSize: typography.size.xl,
      lineHeight: typography.lineHeight.xl,
      letterSpacing: 1.5,
      textAlign: 'center',
      color: c.textPrimary,
    },
    shareQrBox: {
      alignSelf: 'center',
      padding: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    shareHint: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    shareExpiryRow: { flexDirection: 'row', justifyContent: 'center' },
    shareWithdrawRow: {
      paddingHorizontal: 0,
      paddingBottom: 0,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    shareProblem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: c.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    shareProblemText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    sharePrivacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    shareBlocked: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginTop: 12,
    },
    shareBlockedBody: { flex: 1, minWidth: 0, gap: 3 },
    shareBlockedTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textSecondary,
    },

    // -- Medications ---------------------------------------------------------
    medHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.divider,
    },
    medHeadTitle: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.blue,
    },
    emptyItems: { padding: spacing.md },

    item: { paddingHorizontal: spacing.md, paddingVertical: 12, gap: 12 },
    itemDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
    itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    itemIndex: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemIndexOff: { backgroundColor: c.textMuted },
    itemIndexText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textOnBrand,
    },
    itemBody: { flex: 1, minWidth: 0, gap: 2 },
    itemName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: c.textPrimary,
    },
    // Struck through and muted: a cancelled line is still on the record, but it
    // must not read like a live instruction.
    itemNameOff: { color: c.textMuted, textDecorationLine: 'line-through' },
    itemCode: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    itemStatus: { alignItems: 'flex-end', gap: 3, maxWidth: 124 },
    itemMeta: {
      textAlign: 'right',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    dosage: {
      borderRadius: radii.md,
      backgroundColor: c.primarySoft,
      paddingVertical: 12,
      paddingHorizontal: 6,
      gap: 10,
    },
    dosageOff: { backgroundColor: c.surfaceMuted, opacity: 0.6 },
    dosageTitle: {
      paddingHorizontal: 10,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.blue,
    },
    itemFacts: { flexDirection: 'row', alignItems: 'flex-start' },
    itemFactsNext: { paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border },

    retracted: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: radii.sm,
      backgroundColor: c.statusCriticalBg,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    retractedText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.statusCritical,
    },

    dispenseNote: {
      borderRadius: radii.sm,
      backgroundColor: c.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 2,
    },
    dispenseNoteTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    dispenseNoteText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },

    nearby: { borderTopWidth: 1, borderTopColor: c.divider },
    nearbyRow: { paddingHorizontal: 0, paddingBottom: 2 },

    // -- Care-team notes -----------------------------------------------------
    notesRow: { flexDirection: 'row', gap: spacing.sm },
    notesBody: { flex: 1, minWidth: 0, gap: 3 },
    notesTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.blue,
    },
    notesText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
    },
  });
