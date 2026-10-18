import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
/**
 * Pharmacy desk — one prescription (`/clinician/pharmacy/prescription/[id]`).
 *
 * What is on it, who wrote it, who it is for, and the ONE action its stage
 * allows: Accept (incoming → preparing), Mark ready (preparing → ready),
 * Dispense (→ dispensed). Dispensing is a clinical act recorded under the
 * signed-in pharmacist's name and cannot be undone from the app, so it goes
 * through an editable per-item quantity block and a confirmation that names
 * the patient, their Health ID and the number of medicines.
 *
 * ── WHERE THE DATA COMES FROM ─────────────────────────────────────────────
 * The contract has NO single-item GET. This screen re-reads the list it was
 * opened from (`?status=` names the queue, `?health_id=` the lookup) through
 * the same react-query key, and picks its row out of it
 * (`usePrescriptionFromCache`). After a write, the server's returned row is
 * pinned on screen — it is the truth, and the row may have left the queue it
 * was listed in.
 *
 * ── NEVER A FAKE SUCCESS ──────────────────────────────────────────────────
 * A 409 means the prescription moved on since it was listed: say so and
 * re-read. A 403 `role_forbidden` is "not part of your role". A 404/405 is
 * "not here (any more), or the desk is not served on this host yet". A
 * dropped connection or a 5xx after the request left the phone is an UNKNOWN
 * outcome — the sheet says "check before dispensing again", never "failed".
 *
 * i18n: `pharmacyDesk.*`, present in both locales.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  PillInput,
  ScreenHeader,
  SectionHeader,
  StaleNotice,
  StatusBadge,
  formatDate,
  formatNumber,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, NoticeBanner, describeFailure } from '@/components/care/shared';
import { RoleGate } from '@/components/doctor/RoleGate';
import {
  PRESCRIPTION_QUEUES,
  prescriptionStage,
  toNum,
  useAcceptPrescription,
  useDispensePrescription,
  useMarkPrescriptionReady,
  usePrescriptionFromCache,
  type DeskPrescription,
  type DeskPrescriptionItem,
  type DispenseBody,
  type PrescriptionQueueStatus,
} from '@/lib/api/pharmacyDeskQueries';
import {
  DeskFailureState,
  Fact,
  describeWriteFailure,
  patientLine,
  qtyLabel,
  stageLabel,
  stageTone,
  whenLabel,
} from '@/components/pharmacy/shared';
import { pharmacyRoutes } from '@/components/pharmacy/routes';

/** An item's dispensed state as the wire spells it — anything else is still open. */
function itemIsDone(it: DeskPrescriptionItem): boolean {
  const s = (it.status ?? '').toLowerCase().replace(/[\s-]/g, '_');
  return s === 'dispensed' || s === 'completed';
}

export default function DeskPrescriptionScreen() {
  usePrivateScreen();
  return (
    <RoleGate need={['dispense']}>
      <DeskPrescriptionBody />
    </RoleGate>
  );
}

function DeskPrescriptionBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const params = useLocalSearchParams<{ id: string; status?: string; health_id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const statusHint =
    typeof params.status === 'string' && (PRESCRIPTION_QUEUES as readonly string[]).includes(params.status)
      ? (params.status as PrescriptionQueueStatus)
      : null;
  const healthIdHint = typeof params.health_id === 'string' && params.health_id ? params.health_id : null;

  const { prescription, query, settling } = usePrescriptionFromCache(id, {
    status: statusHint,
    healthId: healthIdHint,
  });

  // The server's row after a write wins over the list's copy; the last row we
  // ever saw keeps the screen readable when the row leaves its queue.
  const [pinned, setPinned] = useState<DeskPrescription | null>(null);
  const lastSeen = useRef<DeskPrescription | null>(null);
  useEffect(() => {
    if (prescription) lastSeen.current = prescription;
  }, [prescription]);
  const shown = pinned ?? prescription ?? lastSeen.current;
  const leftQueue = !!shown && !prescription && !pinned && !query.isPending;

  const accept = useAcceptPrescription();
  const ready = useMarkPrescriptionReady();
  const dispense = useDispensePrescription();
  const busy = accept.isPending || ready.isPending || dispense.isPending;

  // ── Dispense block state ─────────────────────────────────────────────
  const [dispensing, setDispensing] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const openDispense = useCallback(
    (p: DeskPrescription) => {
      const next: Record<string, string> = {};
      for (const it of p.items) {
        if (itemIsDone(it)) continue;
        const q = toNum(it.quantity);
        next[it.id] = q === null ? '' : String(q);
      }
      setQuantities(next);
      setNotes('');
      setProblem(null);
      setDispensing(true);
    },
    [],
  );

  /** Failure → a sheet that says what happened and what to check. */
  const reportFailure = useCallback(
    (error: unknown, checkHint: string) => {
      const f = describeWriteFailure(error, checkHint);
      dialog.alert(f.title, f.message, f.kind === 'unknownOutcome' ? 'warning' : 'critical');
      if (f.kind === 'moved') void query.refetch();
    },
    [dialog, query],
  );

  const doAccept = useCallback(
    (p: DeskPrescription) => {
      dialog.confirm({
        title: t('pharmacyDesk.prescription.acceptTitle'),
        message: t('pharmacyDesk.prescription.acceptBody', {
          patient: patientLine(p.patient),
          healthId: p.patient.health_id,
        }),
        confirmLabel: t('pharmacyDesk.prescription.accept'),
        onConfirm: async () => {
          try {
            setPinned(await accept.mutateAsync(p.id));
          } catch (e) {
            reportFailure(e, t('pharmacyDesk.write.checkQueue'));
          }
        },
      });
    },
    [accept, dialog, reportFailure, t],
  );

  const doReady = useCallback(
    (p: DeskPrescription) => {
      dialog.confirm({
        title: t('pharmacyDesk.prescription.readyTitle'),
        message: t('pharmacyDesk.prescription.readyBody', { patient: patientLine(p.patient) }),
        confirmLabel: t('pharmacyDesk.prescription.markReady'),
        onConfirm: async () => {
          try {
            setPinned(await ready.mutateAsync(p.id));
          } catch (e) {
            reportFailure(e, t('pharmacyDesk.write.checkQueue'));
          }
        },
      });
    },
    [dialog, ready, reportFailure, t],
  );

  /** Validate the editable block into the wire body, or name the problem. */
  const buildDispenseBody = useCallback(
    (p: DeskPrescription): DispenseBody | null => {
      const items: DispenseBody['items'] = [];
      for (const it of p.items) {
        if (itemIsDone(it)) continue;
        const raw = (quantities[it.id] ?? '').trim();
        if (raw === '' || raw === '0') continue; // skipped on purpose
        if (!/^\d+$/.test(raw)) {
          setProblem(t('pharmacyDesk.dispense.badQuantity', { drug: it.drug_name }));
          return null;
        }
        items.push({ id: it.id, quantity_dispensed: Number(raw) });
      }
      if (items.length === 0) {
        setProblem(t('pharmacyDesk.dispense.nothingSelected'));
        return null;
      }
      setProblem(null);
      const trimmed = notes.trim();
      return trimmed ? { items, notes: trimmed } : { items };
    },
    [notes, quantities, t],
  );

  const doDispense = useCallback(
    (p: DeskPrescription) => {
      const body = buildDispenseBody(p);
      if (!body) return;
      dialog.confirm({
        title: t('pharmacyDesk.dispense.confirmTitle', { patient: patientLine(p.patient) }),
        message: t('pharmacyDesk.dispense.confirmBody', {
          count: body.items.length,
          patient: patientLine(p.patient),
          healthId: p.patient.health_id,
        }),
        confirmLabel: t('pharmacyDesk.dispense.confirmCta'),
        cancelLabel: t('pharmacyDesk.dispense.confirmCancel'),
        tone: 'warning',
        onConfirm: async () => {
          try {
            const updated = await dispense.mutateAsync({ id: p.id, body });
            setPinned(updated);
            setDispensing(false);
            dialog.alert(
              t('pharmacyDesk.dispense.doneTitle'),
              t('pharmacyDesk.dispense.doneBody', { patient: patientLine(p.patient) }),
              'success',
            );
          } catch (e) {
            reportFailure(e, t('pharmacyDesk.dispense.checkHint'));
          }
        },
      });
    },
    [buildDispenseBody, dialog, dispense, reportFailure, t],
  );

  // ── Render ───────────────────────────────────────────────────────────
  const refreshing = query.isFetching && !query.isPending;
  const onRefresh = () => {
    setPinned(null);
    void query.refetch();
  };

  let body: React.ReactNode;
  if (!id) {
    body = (
      <EmptyState
        icon="alert-circle"
        tint="amber"
        title={t('opesCore.errors.notFoundTitle')}
        message={t('opesCore.errors.notFoundBody')}
      />
    );
  } else if (!shown && settling) {
    body = <LoadingBlock label={t('pharmacyDesk.prescription.loading')} />;
  } else if (!shown && query.isError) {
    body = (
      <Card variant="flush">
        <DeskFailureState error={query.error} onRetry={() => void query.refetch()} icon="pill" />
      </Card>
    );
  } else if (!shown) {
    body = (
      <Card variant="flush">
        <EmptyState
          icon="pill"
          tint="amber"
          title={t('pharmacyDesk.prescription.notInListsTitle')}
          message={t('pharmacyDesk.prescription.notInListsBody')}
          actionLabel={t('pharmacyDesk.prescription.backToDesk')}
          onAction={() => router.replace(pharmacyRoutes.desk())}
        />
      </Card>
    );
  } else {
    const p = shown;
    const stage = prescriptionStage(p);
    const openItems = p.items.filter((it) => !itemIsDone(it));
    const canAccept = stage === 'incoming' || stage === null;
    const canReady = stage === 'preparing';
    const canDispense = (stage === 'preparing' || stage === 'ready' || stage === null) && openItems.length > 0;

    body = (
      <>
        {query.isError && shown !== undefined && (
          <StaleNotice
            message={describeFailure(query.error).message}
            loadedAt={query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        )}
        {leftQueue && (
          <NoticeBanner
            icon="info"
            tone="pending"
            title={t('pharmacyDesk.prescription.leftQueueTitle')}
            message={t('pharmacyDesk.prescription.leftQueueBody')}
          />
        )}

        {/* ── Who and what ─────────────────────────────────────────────── */}
        <Card>
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <Text style={styles.title}>{patientLine(p.patient)}</Text>
              <Text style={styles.subtitle}>{p.patient.health_id}</Text>
            </View>
            <StatusBadge status={stage ?? 'unknown'} tone={stageTone(stage)} label={stageLabel(stage)} />
          </View>
          <View style={styles.divider} />
          {!!p.reference && <Fact label={t('pharmacyDesk.prescription.reference')} value={p.reference} strong />}
          <Fact
            label={t('pharmacyDesk.prescription.prescriber')}
            value={p.prescriber_name?.trim() || t('pharmacyDesk.prescription.prescriberUnknown')}
          />
          <Fact label={t('pharmacyDesk.prescription.prescribedAt')} value={whenLabel(p.prescribed_at)} />
          <Fact
            label={t('pharmacyDesk.prescription.expiresAt')}
            value={p.expires_at ? formatDate(p.expires_at) : t('pharmacyDesk.prescription.noExpiry')}
          />
          {!!p.status && stage !== null && p.status.toLowerCase() !== stage && (
            <Fact label={t('pharmacyDesk.prescription.recordStatus')} value={p.status} />
          )}
          <Text style={[styles.note, styles.noteSpaced]}>{t('pharmacyDesk.prescription.identityOnly')}</Text>
        </Card>

        {/* ── Items ────────────────────────────────────────────────────── */}
        <SectionHeader
          title={t('pharmacyDesk.prescription.items', { count: p.items.length })}
          actionLabel={dispensing ? t('pharmacyDesk.dispense.back') : undefined}
          onAction={dispensing ? () => setDispensing(false) : undefined}
        />
        {dispensing ? (
          <Card>
            <Text style={styles.note}>{t('pharmacyDesk.dispense.intro')}</Text>
            {p.items.map((it) => {
              const done = itemIsDone(it);
              const prescribed = toNum(it.quantity);
              return (
                <View key={it.id} style={styles.editItem}>
                  <View style={styles.editHead}>
                    <Text style={styles.editDrug}>{it.drug_name}</Text>
                    {done && (
                      <StatusBadge
                        status="dispensed"
                        tone="normal"
                        label={t('pharmacyDesk.itemStatus.dispensed')}
                        size="sm"
                      />
                    )}
                  </View>
                  <Text style={styles.editMeta}>{itemMeta(it, t)}</Text>
                  {!done && (
                    <PillInput
                      icon={<Icon name="pill" size={18} color={colors.blue} />}
                      value={quantities[it.id] ?? ''}
                      onChangeText={(v) => {
                        setQuantities((q) => ({ ...q, [it.id]: v }));
                        if (problem) setProblem(null);
                      }}
                      placeholder={
                        prescribed === null
                          ? t('pharmacyDesk.dispense.qtyPlaceholder')
                          : t('pharmacyDesk.dispense.qtyPrescribed', { count: formatNumber(prescribed) })
                      }
                      keyboardType="number-pad"
                      maxLength={5}
                      accessibilityLabel={t('pharmacyDesk.dispense.qtyLabel', { drug: it.drug_name })}
                    />
                  )}
                </View>
              );
            })}
            <Text style={styles.fieldLabel}>{t('pharmacyDesk.dispense.notesLabel')}</Text>
            <PillInput
              icon={<Icon name="document-text" size={18} color={colors.blue} />}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('pharmacyDesk.dispense.notesPlaceholder')}
              multiline
              maxLength={500}
              style={styles.multiline}
              accessibilityLabel={t('pharmacyDesk.dispense.notesLabel')}
            />
            {!!problem && (
              <Text style={styles.problem} accessibilityRole="alert">
                {problem}
              </Text>
            )}
            <Text style={styles.note}>{t('pharmacyDesk.dispense.skipHint')}</Text>
            <View style={[styles.actions, styles.noteSpaced]}>
              <CareButton
                label={t('pharmacyDesk.dispense.record')}
                icon="check"
                style={styles.action}
                onPress={() => doDispense(p)}
                loading={dispense.isPending}
                disabled={busy}
              />
              <CareButton
                label={t('pharmacyDesk.dispense.back')}
                icon="close"
                variant="secondary"
                style={styles.action}
                onPress={() => setDispensing(false)}
                disabled={busy}
              />
            </View>
          </Card>
        ) : (
          <Card variant="flush">
            {p.items.length === 0 ? (
              <Text style={[styles.note, styles.padded]}>{t('pharmacyDesk.prescription.noItems')}</Text>
            ) : (
              p.items.map((it, i, arr) => (
                <ListRow
                  key={it.id}
                  icon="pill"
                  tint={itemIsDone(it) ? 'green' : 'blue'}
                  title={it.drug_name}
                  meta={[itemMeta(it, t)]}
                  subtitleLines={3}
                  trailing={
                    it.status ? (
                      <StatusBadge
                        status={it.status}
                        label={itemStatusLabel(it, t)}
                        tone={itemIsDone(it) ? 'normal' : 'pending'}
                        size="sm"
                      />
                    ) : undefined
                  }
                  divider={i < arr.length - 1}
                  chevron={false}
                />
              ))
            )}
          </Card>
        )}

        {/* ── Actions by stage ─────────────────────────────────────────── */}
        {!dispensing && (
          <>
            {stage === 'dispensed' && (
              <NoticeBanner
                icon="check-circle"
                tone="normal"
                title={t('pharmacyDesk.prescription.dispensedTitle')}
                message={t('pharmacyDesk.prescription.dispensedBody')}
              />
            )}
            {stage === null && (
              <NoticeBanner
                icon="info"
                tone="pending"
                message={t('pharmacyDesk.prescription.stageUnknownBody')}
              />
            )}
            {(canAccept || canReady || canDispense) && (
              <View style={styles.actionsStack}>
                {canAccept && (
                  <CareButton
                    label={t('pharmacyDesk.prescription.accept')}
                    icon="check"
                    onPress={() => doAccept(p)}
                    loading={accept.isPending}
                    disabled={busy}
                  />
                )}
                {canReady && (
                  <CareButton
                    label={t('pharmacyDesk.prescription.markReady')}
                    icon="check-circle"
                    onPress={() => doReady(p)}
                    loading={ready.isPending}
                    disabled={busy}
                  />
                )}
                {canDispense && (
                  <CareButton
                    label={t('pharmacyDesk.prescription.dispense')}
                    icon="pill"
                    variant={stage === 'ready' || stage === null ? 'primary' : 'secondary'}
                    onPress={() => openDispense(p)}
                    disabled={busy}
                  />
                )}
              </View>
            )}
            <Text style={styles.footer}>{t('pharmacyDesk.prescription.footer')}</Text>
          </>
        )}
      </>
    );
  }

  const headerTitle = shown ? patientLine(shown.patient) : t('pharmacyDesk.prescription.title');
  const headerSubtitle = shown
    ? shown.reference
      ? t('pharmacyDesk.prescription.subtitleRef', { ref: shown.reference })
      : shown.patient.health_id
    : undefined;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={headerTitle} subtitle={headerSubtitle} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
      >
        {body}
      </ScrollView>
      {dialog.element}
    </SafeAreaView>
  );
}

/** "500 mg · 3× daily · 7 days · ×21" — only the parts the prescriber wrote. */
function itemMeta(it: DeskPrescriptionItem, t: (key: string, params?: Record<string, unknown>) => string): string {
  const days = toNum(it.duration_days);
  return [
    it.dose,
    it.frequency,
    days !== null ? t('pharmacyDesk.prescription.days', { count: days }) : null,
    qtyLabel(it.quantity),
  ]
    .filter(Boolean)
    .join(' · ');
}

function itemStatusLabel(it: DeskPrescriptionItem, t: (key: string) => string): string {
  const s = (it.status ?? '').toLowerCase().replace(/[\s-]/g, '_');
  if (s === 'dispensed' || s === 'completed') return t('pharmacyDesk.itemStatus.dispensed');
  if (s === 'partially_dispensed') return t('pharmacyDesk.itemStatus.partial');
  if (s === 'pending' || s === 'active' || s === 'open') return t('pharmacyDesk.itemStatus.pending');
  return it.status ?? '';
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    titleText: { flex: 1, minWidth: 0 },
    title: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textPrimary,
    },
    subtitle: {
      marginTop: 2,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },
    note: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    noteSpaced: { marginTop: spacing.sm },
    padded: { padding: spacing.md },
    fieldLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
    },
    multiline: { minHeight: 64, textAlignVertical: 'top' },
    editItem: {
      paddingTop: spacing.sm + 4,
      marginTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    editHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    editDrug: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    editMeta: {
      marginTop: 2,
      marginBottom: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    problem: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.danger,
      marginBottom: spacing.sm,
    },
    actions: { flexDirection: 'row', gap: spacing.sm },
    action: { flex: 1 },
    actionsStack: { gap: spacing.sm },
    footer: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: spacing.md,
    },
  });
