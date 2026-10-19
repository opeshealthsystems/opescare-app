/**
 * Pharmacy desk (`/clinician/pharmacy`) — the pharmacist's one screen.
 *
 * One job: dispense medication, take medicine orders (reservations) through
 * to pickup or delivery, and keep the shelf right. The pharmacist never opens
 * a chart from here; their role holds `dispense`, `pharmacy_stock`,
 * `request_access`, `identify_patient` and `messaging` and nothing else
 * (`lib/staffCapabilities.ts`), and the server refuses the rest.
 *
 * Three blocks, top to bottom:
 *   1. TILES — six figures the SERVER counted for this facility
 *      (`GET /mobile/pharmacy/home`). Zero is drawn as zero; a read that
 *      failed is a failure state, never a row of zeros.
 *   2. DISPENSE BY HEALTH ID — an EXACT Health ID, one press, this patient's
 *      prescriptions dispensable here (`GET …/prescriptions/lookup`). No name
 *      search, no prefix, no list of patients — platform policy, enforced by
 *      the same `isPlausibleHealthId` gate the clinician lookup uses. The
 *      scanner hands a `?health_id=` here and it is looked up at once.
 *   3. QUEUES — Prescriptions (incoming → preparing → ready → dispensed) and
 *      Reservations (pending → accepted → ready → collected, or → dispatched
 *      → delivered for a delivery). A row opens its detail with a hint naming
 *      the list it came from, because the contract has no single-item GET.
 *
 * Degrades honestly: the desk routes are being served by a backend agent in
 * parallel; a 404/405 renders "not available on this server yet" (with the
 * server's sentence) and a retry — never an empty queue.
 *
 * i18n: every string is `pharmacyDesk.*`, present in both locales.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardStack,
  Chip,
  EmptyState,
  Icon,
  PillInput,
  ScreenHeader,
  SectionHeader,
  SegmentedTabs,
  StaleNotice,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, describeFailure } from '@/components/care/shared';
import { RoleGate } from '@/components/doctor/RoleGate';
import { doctorRoutes } from '@/components/doctor/chartRoutes';
import { useStaffCapability } from '@/lib/staffCapabilities';
import {
  HEALTH_ID_MIN_LENGTH,
  PRESCRIPTION_QUEUES,
  RESERVATION_STATUSES,
  isPharmacyDeskNotServed,
  isPlausibleHealthId,
  isRoleForbidden,
  normaliseHealthId,
  usePharmacyHome,
  usePrescriptionLookup,
  usePrescriptionQueue,
  useReservations,
  type PrescriptionQueueStatus,
  type ReservationStatus,
} from '@/lib/api/pharmacyDeskQueries';
import {
  DeskFailureState,
  DeskTile,
  PrescriptionRow,
  ReservationRow,
  reservationStatusLabel,
  stageLabel,
} from '@/components/pharmacy/shared';
import { pharmacyRoutes } from '@/components/pharmacy/routes';

type QueueTab = 'prescriptions' | 'reservations';

/** One submitted lookup. The nonce lets the same ID be looked up twice. */
type LookupRequest = { healthId: string; nonce: number };

/** The reservation lists drawn as chips, in flow order; `cancelled` last. */
const RESERVATION_CHIPS: ReservationStatus[] = [...RESERVATION_STATUSES];

export default function PharmacyDeskScreen() {
  return (
    <RoleGate need={['dispense']}>
      <PharmacyDeskBody />
    </RoleGate>
  );
}

function PharmacyDeskBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const canStock = useStaffCapability('pharmacy_stock');
  const params = useLocalSearchParams<{ health_id?: string }>();

  // ── Tiles ────────────────────────────────────────────────────────────
  const home = usePharmacyHome();

  // ── Queues ───────────────────────────────────────────────────────────
  const [tab, setTab] = useState<QueueTab>('prescriptions');
  const [stage, setStage] = useState<PrescriptionQueueStatus>('incoming');
  const [resStatus, setResStatus] = useState<ReservationStatus>('pending');
  const queue = usePrescriptionQueue(stage, {
    enabled: tab === 'prescriptions',
  });
  const reservations = useReservations(resStatus, {
    enabled: tab === 'reservations',
  });
  const active = tab === 'prescriptions' ? queue : reservations;

  // ── Dispense by Health ID ────────────────────────────────────────────
  const [entry, setEntry] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [request, setRequest] = useState<LookupRequest | null>(null);
  const nonce = useRef(0);
  const lookup = usePrescriptionLookup(request?.healthId ?? null);

  // A Health ID handed over by the scanner is looked up at once — once per
  // value, and only a plausible one: nothing partial is ever sent.
  const prefilled = useRef<string | null>(null);
  useEffect(() => {
    const raw = typeof params.health_id === 'string' ? normaliseHealthId(params.health_id) : '';
    if (!raw || prefilled.current === raw || !isPlausibleHealthId(raw)) return;
    prefilled.current = raw;
    setEntry(raw);
    setEntryError(null);
    nonce.current += 1;
    setRequest({ healthId: raw, nonce: nonce.current });
  }, [params.health_id]);

  const submit = useCallback(() => {
    const healthId = normaliseHealthId(entry);
    if (!isPlausibleHealthId(healthId)) {
      setEntryError(t('pharmacyDesk.lookup.invalid', { min: HEALTH_ID_MIN_LENGTH }));
      setRequest(null);
      return;
    }
    setEntryError(null);
    nonce.current += 1;
    setRequest({ healthId, nonce: nonce.current });
  }, [entry, t]);

  const clear = useCallback(() => {
    setEntry('');
    setEntryError(null);
    setRequest(null);
  }, []);

  const openQueue = useCallback((next: QueueTab, s: PrescriptionQueueStatus | ReservationStatus) => {
    setTab(next);
    if (next === 'prescriptions') setStage(s as PrescriptionQueueStatus);
    else setResStatus(s as ReservationStatus);
  }, []);

  const refreshing = (home.isFetching && !home.isPending) || (active.isFetching && !active.isPending);
  const onRefresh = () => {
    void home.refetch();
    void active.refetch();
    if (request) void lookup.refetch();
  };

  const facilityName = home.data?.facility?.name?.trim() || null;

  const headerActions = [
    ...(canStock
      ? [
          {
            icon: 'archive' as IconName,
            onPress: () => router.push(pharmacyRoutes.stock()),
            accessibilityLabel: t('pharmacyDesk.stock.title'),
          },
        ]
      : []),
    {
      icon: 'qr' as IconName,
      onPress: () => router.push(doctorRoutes.scan),
      accessibilityLabel: t('pharmacyDesk.lookup.scan'),
    },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      {/* A tab root for every dispensing role (`app/clinician/_layout.tsx`
          registers `pharmacy/index` as a slot), so no back chevron — the same
          choice as the Patients tab. */}
      <ScreenHeader
        title={t('pharmacyDesk.home.title')}
        subtitle={facilityName ?? t('pharmacyDesk.home.subtitle')}
        showBack={false}
        actions={headerActions}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
      >
        {/* ── 1. Tiles ─────────────────────────────────────────────────── */}
        {home.isError && home.data !== undefined && (
          <StaleNotice
            message={describeFailure(home.error).message}
            loadedAt={home.dataUpdatedAt ? new Date(home.dataUpdatedAt) : null}
            onRetry={() => void home.refetch()}
            retrying={home.isFetching}
          />
        )}
        {home.isPending ? (
          <LoadingBlock label={t('pharmacyDesk.home.loading')} />
        ) : home.isError && home.data === undefined ? (
          <Card variant="flush">
            <DeskFailureState error={home.error} onRetry={() => void home.refetch()} />
          </Card>
        ) : home.data ? (
          <View>
            <SectionHeader title={t('pharmacyDesk.home.waiting')} />
            <View style={styles.tiles}>
              <DeskTile
                icon="pill"
                tint="amber"
                count={home.data.counts.incoming}
                label={t('pharmacyDesk.home.tileIncoming')}
                onPress={() => openQueue('prescriptions', 'incoming')}
              />
              <DeskTile
                icon="clipboard"
                tint="blue"
                count={home.data.counts.preparing}
                label={t('pharmacyDesk.home.tilePreparing')}
                onPress={() => openQueue('prescriptions', 'preparing')}
              />
              <DeskTile
                icon="check-circle"
                tint="green"
                count={home.data.counts.ready}
                label={t('pharmacyDesk.home.tileReady')}
                onPress={() => openQueue('prescriptions', 'ready')}
              />
              <DeskTile
                icon="cart"
                tint="purple"
                count={home.data.counts.reservations_pending}
                label={t('pharmacyDesk.home.tileReservations')}
                onPress={() => openQueue('reservations', 'pending')}
              />
              <DeskTile
                icon="truck"
                tint="purple"
                count={home.data.counts.deliveries_open}
                label={t('pharmacyDesk.home.tileDeliveries')}
                onPress={() => openQueue('reservations', 'dispatched')}
              />
              <DeskTile
                icon="alert-triangle"
                tint="amber"
                count={home.data.counts.low_stock}
                label={t('pharmacyDesk.home.tileLowStock')}
                emphasise
                onPress={() => (canStock ? router.push(pharmacyRoutes.stock(true)) : openQueue('prescriptions', stage))}
              />
            </View>
          </View>
        ) : null}

        {/* ── 2. Dispense by Health ID ─────────────────────────────────── */}
        <View>
          <SectionHeader title={t('pharmacyDesk.lookup.title')} />
          <Card>
            <Text style={styles.fieldLabel}>{t('pharmacyDesk.lookup.label')}</Text>
            <PillInput
              icon={<Icon name="id-card" size={18} color={colors.blue} />}
              value={entry}
              onChangeText={(v) => {
                setEntry(v);
                if (entryError) setEntryError(null);
              }}
              onSubmitEditing={submit}
              placeholder={t('pharmacyDesk.lookup.placeholder')}
              error={entryError ?? undefined}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              textContentType="none"
              returnKeyType="search"
              accessibilityLabel={t('pharmacyDesk.lookup.label')}
            />
            <View style={styles.actions}>
              <CareButton
                label={t('pharmacyDesk.lookup.lookUp')}
                icon="search"
                style={styles.action}
                onPress={submit}
                loading={!!request && lookup.isPending}
                disabled={entry.trim().length === 0}
              />
              <CareButton
                label={t('pharmacyDesk.lookup.scan')}
                icon="qr"
                variant="secondary"
                style={styles.action}
                onPress={() => router.push(doctorRoutes.scan)}
              />
              {(entry.length > 0 || !!request) && (
                <CareButton
                  label={t('pharmacyDesk.lookup.clear')}
                  icon="close"
                  variant="secondary"
                  style={styles.action}
                  onPress={clear}
                />
              )}
            </View>
            <Text style={[styles.note, styles.noteSpaced]}>{t('pharmacyDesk.lookup.noNameSearch')}</Text>
          </Card>

          {request && (
            <View style={styles.lookupResult}>
              {lookup.isPending ? (
                <LoadingBlock label={t('pharmacyDesk.lookup.searching')} />
              ) : lookup.isError ? (
                <Card variant="flush">
                  {isRoleForbidden(lookup.error) ? (
                    <DeskFailureState error={lookup.error} onRetry={() => void lookup.refetch()} />
                  ) : isPharmacyDeskNotServed(lookup.error) ? (
                    // "No such patient" and "no such route" answer the same
                    // way; this screen refuses to claim either.
                    <EmptyState
                      icon="person-search"
                      tint="amber"
                      title={t('pharmacyDesk.lookup.noAnswerTitle')}
                      message={t('pharmacyDesk.lookup.noAnswerBody', {
                        healthId: request.healthId,
                      })}
                      actionLabel={t('opesCore.common.retry')}
                      onAction={() => void lookup.refetch()}
                    />
                  ) : (
                    <DeskFailureState error={lookup.error} onRetry={() => void lookup.refetch()} />
                  )}
                </Card>
              ) : lookup.data?.patient === null ? (
                <Card variant="flush">
                  <EmptyState
                    icon="person-search"
                    tint="amber"
                    title={t('pharmacyDesk.lookup.noPatientTitle')}
                    message={t('pharmacyDesk.lookup.noPatientBody', {
                      healthId: request.healthId,
                    })}
                  />
                </Card>
              ) : (lookup.data?.prescriptions.length ?? 0) === 0 ? (
                <Card variant="flush">
                  <EmptyState
                    icon="pill"
                    tint="blue"
                    title={t('pharmacyDesk.lookup.emptyTitle')}
                    message={t('pharmacyDesk.lookup.emptyBody', {
                      healthId: request.healthId,
                    })}
                  />
                </Card>
              ) : (
                <>
                  <SectionHeader
                    title={t('pharmacyDesk.lookup.resultsTitle', {
                      count: lookup.data?.prescriptions.length ?? 0,
                    })}
                    variant="overline"
                  />
                  <CardStack spacing="sm">
                    {(lookup.data?.prescriptions ?? []).map((p) => (
                      <Card key={p.id} variant="flush">
                        <PrescriptionRow
                          prescription={p}
                          onPress={() =>
                            router.push(
                              pharmacyRoutes.prescription(p.id, {
                                healthId: request.healthId,
                              }),
                            )
                          }
                        />
                      </Card>
                    ))}
                  </CardStack>
                </>
              )}
            </View>
          )}
        </View>

        {/* ── 3. Queues ────────────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('pharmacyDesk.queues.title')} />
          <SegmentedTabs
            options={[
              {
                key: 'prescriptions',
                label: t('pharmacyDesk.queues.prescriptions'),
              },
              {
                key: 'reservations',
                label: t('pharmacyDesk.queues.reservations'),
              },
            ]}
            value={tab}
            onChange={(key) => setTab(key as QueueTab)}
            style={styles.tabs}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
          >
            {tab === 'prescriptions'
              ? PRESCRIPTION_QUEUES.map((s) => (
                  <Chip
                    key={s}
                    label={stageLabel(s)}
                    selected={stage === s}
                    count={countForStage(home.data?.counts, s)}
                    onPress={() => setStage(s)}
                  />
                ))
              : RESERVATION_CHIPS.map((s) => (
                  <Chip
                    key={s}
                    label={reservationStatusLabel(s)}
                    selected={resStatus === s}
                    count={s === 'pending' ? home.data?.counts.reservations_pending : undefined}
                    onPress={() => setResStatus(s)}
                  />
                ))}
          </ScrollView>

          {active.isError && active.data !== undefined && (
            <StaleNotice
              message={describeFailure(active.error).message}
              loadedAt={active.dataUpdatedAt ? new Date(active.dataUpdatedAt) : null}
              onRetry={() => void active.refetch()}
              retrying={active.isFetching}
            />
          )}

          {tab === 'prescriptions' ? (
            queue.isPending ? (
              <LoadingBlock label={t('pharmacyDesk.queues.loading')} />
            ) : queue.isError && queue.data === undefined ? (
              <Card variant="flush">
                <DeskFailureState error={queue.error} onRetry={() => void queue.refetch()} icon="pill" />
              </Card>
            ) : (queue.data?.length ?? 0) === 0 ? (
              <Card variant="flush">
                <EmptyState
                  icon="pill"
                  tint="green"
                  title={t(`pharmacyDesk.queueEmpty.${stage}Title`)}
                  message={t(`pharmacyDesk.queueEmpty.${stage}Body`)}
                />
              </Card>
            ) : (
              <CardStack spacing="sm">
                {(queue.data ?? []).map((p) => (
                  <Card key={p.id} variant="flush">
                    <PrescriptionRow
                      prescription={p}
                      onPress={() => router.push(pharmacyRoutes.prescription(p.id, { status: stage }))}
                    />
                  </Card>
                ))}
              </CardStack>
            )
          ) : reservations.isPending ? (
            <LoadingBlock label={t('pharmacyDesk.queues.loading')} />
          ) : reservations.isError && reservations.data === undefined ? (
            <Card variant="flush">
              <DeskFailureState error={reservations.error} onRetry={() => void reservations.refetch()} icon="cart" />
            </Card>
          ) : (reservations.data?.length ?? 0) === 0 ? (
            <Card variant="flush">
              <EmptyState
                icon="cart"
                tint="purple"
                title={t('pharmacyDesk.reservationsEmpty.title', {
                  status: reservationStatusLabel(resStatus),
                })}
                message={t('pharmacyDesk.reservationsEmpty.body')}
              />
            </Card>
          ) : (
            <CardStack spacing="sm">
              {(reservations.data ?? []).map((r) => (
                <Card key={r.id} variant="flush">
                  <ReservationRow
                    reservation={r}
                    onPress={() => router.push(pharmacyRoutes.reservation(r.id, { status: resStatus }))}
                  />
                </Card>
              ))}
            </CardStack>
          )}
        </View>

        <Text style={styles.footer}>{t('pharmacyDesk.home.footer')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/** The home count that names a prescription queue, when the home read has one. */
function countForStage(
  counts: { incoming: number; preparing: number; ready: number } | undefined,
  stage: PrescriptionQueueStatus,
): number | undefined {
  if (!counts) return undefined;
  switch (stage) {
    case 'incoming':
      return counts.incoming;
    case 'preparing':
      return counts.preparing;
    case 'ready':
      return counts.ready;
    default:
      return undefined;
  }
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: {
      padding: spacing.md,
      paddingTop: 0,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    fieldLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    note: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    noteSpaced: { marginTop: spacing.sm },
    actions: { flexDirection: 'row', gap: spacing.sm },
    action: { flex: 1 },
    lookupResult: { marginTop: spacing.md, gap: spacing.sm },
    tabs: { marginBottom: spacing.sm },
    chips: {
      gap: spacing.sm,
      paddingBottom: spacing.sm,
      paddingRight: spacing.md,
    },
    footer: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: spacing.md,
    },
  });
