import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  EmptyState,
  formatDate,
  formatDateTime,
  formatLabel,
  Icon,
  ListRow,
  radii,
  ScreenHeader,
  SectionHeader,
  spacing,
  StatusBadge,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import { extractApiErrorMessage } from '../../lib/api/queries';
import {
  useConsentLedger,
  useRevokeConsentGrant,
  type CareRelationshipItem,
  type ConsentGrantItem,
  type ConsentGrantState,
} from '../../lib/api/consentLedgerQueries';

/**
 * Who can see my record — the consent ledger.
 *
 * The one question a consent-scoped record has to be able to answer, and until
 * now could not: the API had `POST /mobile/consents/{id}/revoke` and no
 * endpoint that listed grants, so there was no way to learn the `{id}`. The
 * privacy hub filled the hole with `GET /mobile/consent-requests`, which finds
 * a grant only by following `consent_requests.grant` — every grant created
 * without an originating request was invisible, and the hub said "no facility
 * has access" while live grants existed.
 *
 * ── Three lists, and they are not interchangeable ───────────────────────────
 *
 *  1. ACTIVE          — live grants. Each one carries the id revoke takes, and
 *                       the withdraw control sits on the row itself, so seeing
 *                       and withdrawing are the same screen.
 *
 *  2. HISTORY         — expired and withdrawn grants, visually separate and
 *                       never dressed as live: muted card, no accent, a
 *                       neutral badge, no withdraw control, and the server's
 *                       own sentence saying it has ended. An expired grant
 *                       rendered like a live one is the same class of bug as a
 *                       retracted prescription that still reads "Active" — and
 *                       it is a real risk here, because nothing in the backend
 *                       sweeps `consent_grants.status`, so an expired grant is
 *                       still literally `status = 'active'` in the table. The
 *                       server derives the state from the expiry as well as the
 *                       column; this screen renders what it derived.
 *
 *  3. ACCESS THROUGH YOUR CARE — the honest part. A clinician treating you can
 *                       open your record with no grant at all (an appointment,
 *                       your care team, treatment they gave you, an open
 *                       episode at a facility). None of that is consent, so
 *                       none of it appears above: it has its own section, its
 *                       own amber styling, a "Not a consent grant" badge, no
 *                       withdraw control, and the server's note saying plainly
 *                       that withdrawing consent does not end it. A patient who
 *                       revokes everything and then watches their doctor read
 *                       the chart has been misled; showing these as grants
 *                       would have been the bigger lie, because the row would
 *                       carry a withdraw button that withdraws nothing.
 *
 * ── Presentation ────────────────────────────────────────────────────────────
 *
 * The OPES kit, like every other patient screen: `ScreenHeader`, overline
 * `SectionHeader`s, `Card variant="flush"` stacks, `ListRow`, `StatusBadge`,
 * `Chip` for scopes, `EmptyState` for every empty list. No icon library beyond
 * the kit's own outline set, no emoji, and not one hardcoded colour —
 * everything reads `useTheme()`, whose default palette is the OpesCare brand.
 *
 * Confirmations go through the kit `Dialog`, never `Alert.alert`: Alert is a
 * silent no-op on React Native Web, and withdrawing access to a medical record
 * must not depend on a dialog that may never appear.
 *
 * Every sentence describing a state, an authority or a care relationship comes
 * from the server already translated — the hook sends the running language —
 * so this screen is bilingual today, not once the pending locale files are
 * merged.
 */

type ScreenNotice = { tone: StatusTone; icon: IconName; body: string };

/** How each derived state is dressed. Active is the only one that looks live. */
const STATE_SKIN: Record<ConsentGrantState, { tone: StatusTone; icon: IconName; tint: Tint }> = {
  active: { tone: 'normal', icon: 'shield-check', tint: 'green' },
  expired: { tone: 'warning', icon: 'clock', tint: 'amber' },
  revoked: { tone: 'neutral', icon: 'lock', tint: 'purple' },
  ended: { tone: 'neutral', icon: 'x-circle', tint: 'purple' },
};

/** One icon per care-relationship basis. None of them is a consent glyph. */
const BASIS_ICON: Record<CareRelationshipItem['basis'], IconName> = {
  appointment: 'calendar',
  care_team: 'users',
  treating_clinician: 'stethoscope',
  facility_episode: 'building',
};

export default function ConsentLedgerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useConsentLedger();
  const revoke = useRevokeConsentGrant();

  const active = data?.active ?? [];
  const history = data?.history ?? [];
  const relationships = data?.careRelationships ?? [];
  const meta = data?.meta;

  const facilityName = useCallback(
    (item: ConsentGrantItem | CareRelationshipItem) =>
      item.facility?.name ?? t('consentLedger.unknownFacility', { defaultValue: 'Facility not named' }),
    [t],
  );

  /**
   * Withdraw, from the row that showed the grant. The id is the one the server
   * listed — there is nothing to look up and nothing to guess.
   */
  const confirmWithdraw = useCallback(
    (item: ConsentGrantItem) => {
      setNotice(null);
      dialog.confirm({
        title: t('consentLedger.confirmTitle', { defaultValue: 'Withdraw access' }),
        message: t('consentLedger.confirmBody', {
          facility: facilityName(item),
          defaultValue:
            '{{facility}} will no longer be able to open your record. This takes effect immediately. You can grant access again later if you need to.',
        }),
        confirmLabel: t('consentLedger.confirmCta', { defaultValue: 'Withdraw it' }),
        // The safe way out, in the patient's own words.
        cancelLabel: t('consentLedger.keepAccess', { defaultValue: 'Keep access' }),
        destructive: true,
        onConfirm: () =>
          new Promise<void>((resolve) => {
            revoke.mutate(item.id, {
              onSuccess: () => {
                setNotice({
                  tone: 'normal',
                  icon: 'check-circle',
                  body: t('consentLedger.withdrawnNotice', {
                    facility: facilityName(item),
                    defaultValue: '{{facility}} can no longer open your record.',
                  }),
                });
                // It has moved to History — open it, so the patient sees where
                // the row went rather than watching it vanish.
                setHistoryOpen(true);
                resolve();
              },
              onError: (err) => {
                setNotice({ tone: 'critical', icon: 'alert-circle', body: extractApiErrorMessage(err) });
                resolve();
              },
            });
          }),
      });
    },
    [dialog, facilityName, revoke, t],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('consentLedger.title', { defaultValue: 'Who can see my record' })}
        subtitle={t('consentLedger.subtitle', { defaultValue: 'Access to your record, right now' })}
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.blue}
            colors={[colors.blue]}
          />
        }
      >
        {notice ? <Notice tone={notice.tone} icon={notice.icon} body={notice.body} /> : null}

        {isLoading ? (
          <Card>
            <View style={styles.loading} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.blue} />
              <Text style={styles.loadingText}>
                {t('consentLedger.loading', { defaultValue: 'Checking who has access' })}
              </Text>
            </View>
          </Card>
        ) : isError ? (
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('consentLedger.errorTitle', {
                defaultValue: 'We could not check your access list',
              })}
              message={t('consentLedger.errorBody', {
                defaultValue:
                  'Your record is not open to anyone new because of this — we simply could not read the list. Try again in a moment.',
              })}
              actionLabel={t('consentLedger.retry', { defaultValue: 'Try again' })}
              onAction={() => refetch()}
            />
          </Card>
        ) : (
          <>
            {/* A count that describes only part of the truth is worse than no
                count, so the server says when a list was capped and the screen
                repeats it before any figure is read. */}
            {meta?.truncated ? (
              <Notice
                tone="warning"
                icon="alert-triangle"
                title={t('consentLedger.truncatedTitle', {
                  defaultValue: 'This list is not complete',
                })}
                body={t('consentLedger.truncatedBody', {
                  defaultValue:
                    'There is more access on your record than fits in one list. The counts above describe what is shown here, not everything there is.',
                })}
              />
            ) : null}

            {/* ── Right now ──────────────────────────────────────────────── */}
            <View>
              <SectionHeader
                title={t('consentLedger.summaryTitle', { defaultValue: 'Right now' })}
                variant="overline"
              />
              <Card variant="flush">
                <SummaryRow
                  icon="shield-check"
                  tint="green"
                  value={meta?.active_count ?? active.length}
                  label={t('consentLedger.statActive', { defaultValue: 'Active access' })}
                  caption={t('consentLedger.statActiveCaption', {
                    defaultValue: 'Facilities that can open your record',
                  })}
                  divider
                />
                <SummaryRow
                  icon="clock"
                  tint="amber"
                  value={meta?.expiring_soon_count ?? 0}
                  label={t('consentLedger.statExpiring', { defaultValue: 'Expiring soon' })}
                  caption={t('consentLedger.statExpiringCaption', {
                    defaultValue: 'Active access ending within a week',
                  })}
                  divider
                />
                <SummaryRow
                  icon="history"
                  tint="purple"
                  value={meta?.history_count ?? history.length}
                  label={t('consentLedger.statEnded', { defaultValue: 'Ended' })}
                  caption={t('consentLedger.statEndedCaption', {
                    defaultValue: 'Expired or withdrawn — kept as history',
                  })}
                  divider
                />
                <SummaryRow
                  icon="stethoscope"
                  tint="blue"
                  value={meta?.care_relationship_count ?? relationships.length}
                  label={t('consentLedger.statOther', { defaultValue: 'Through your care' })}
                  caption={t('consentLedger.statOtherCaption', {
                    defaultValue:
                      'Access that is not consent, and cannot be withdrawn here',
                  })}
                />
              </Card>
            </View>

            {/* ── Active grants ──────────────────────────────────────────── */}
            <View>
              <SectionHeader
                title={t('consentLedger.activeSection', { defaultValue: 'Active access' })}
                variant="overline"
              />
              {active.length > 0 ? (
                <Text style={styles.sectionHint}>
                  {t('consentLedger.activeHint', {
                    defaultValue:
                      'Each of these can open your record now. You can withdraw any of them.',
                  })}
                </Text>
              ) : null}

              {active.length === 0 ? (
                <Card variant="flush">
                  <EmptyState
                    icon="shield-check"
                    tint="green"
                    title={t('consentLedger.activeEmptyTitle', {
                      defaultValue: 'No facility holds access',
                    })}
                    message={t('consentLedger.activeEmptyBody', {
                      defaultValue:
                        'Nobody currently holds a consent grant over your record. Check the section below — a clinician treating you can still open it without one.',
                    })}
                  />
                </Card>
              ) : (
                <View style={styles.stack}>
                  {active.map((item) => (
                    <GrantCard
                      key={item.id}
                      item={item}
                      onWithdraw={() => confirmWithdraw(item)}
                      withdrawing={revoke.isPending}
                    />
                  ))}
                </View>
              )}
            </View>

            {/* ── Access that is not consent ─────────────────────────────── */}
            <View>
              <SectionHeader
                title={t('consentLedger.relationshipsSection', {
                  defaultValue: 'Access through your care',
                })}
                variant="overline"
              />

              {/* The server's own sentence, shown whether or not the list is
                  empty: "nobody else can see it" is a claim, and it has to be
                  as visible as the list itself. */}
              {meta?.care_relationship_note ? (
                <Notice tone="pending" icon="info" body={meta.care_relationship_note} />
              ) : null}

              <View style={styles.stackTop}>
                {relationships.length === 0 ? (
                  <Card variant="flush">
                    <EmptyState
                      icon="stethoscope"
                      tint="blue"
                      title={t('consentLedger.relationshipsEmptyTitle', {
                        defaultValue: 'No care relationship gives access',
                      })}
                      message={t('consentLedger.relationshipsEmptyBody', {
                        defaultValue:
                          'Nobody can open your record through an appointment, a care team, past treatment or an open episode of care.',
                      })}
                    />
                  </Card>
                ) : (
                  <View style={styles.stack}>
                    {relationships.map((item, index) => (
                      <RelationshipCard
                        key={`${item.basis}-${item.clinician?.id ?? item.facility?.id ?? index}`}
                        item={item}
                      />
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* ── History ────────────────────────────────────────────────── */}
            <View>
              <Card variant="flush">
                <ListRow
                  icon="history"
                  tint="purple"
                  title={t('consentLedger.historySection', { defaultValue: 'History' })}
                  subtitle={
                    history.length > 0
                      ? t('consentLedger.historyHint', {
                          defaultValue:
                            'Access that has ended. None of these can open your record.',
                        })
                      : t('consentLedger.historyEmptyBody', {
                          defaultValue:
                            'When access expires or you withdraw it, it moves here so you can still see that it existed.',
                        })
                  }
                  onPress={history.length > 0 ? () => setHistoryOpen((v) => !v) : undefined}
                  chevron={false}
                  value={history.length > 0 ? String(history.length) : undefined}
                  trailing={
                    history.length > 0 ? (
                      <Icon
                        name={historyOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textMuted}
                      />
                    ) : undefined
                  }
                />
              </Card>

              {historyOpen && history.length > 0 ? (
                <View style={[styles.stack, styles.stackTop]}>
                  {history.map((item) => (
                    <GrantCard key={item.id} item={item} />
                  ))}
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/**
 * One consent grant.
 *
 * A live grant gets the brand hairline, a green shield badge and the withdraw
 * control. An ended one gets none of those: muted surface, neutral badge, the
 * date it stopped, and the server's sentence saying it has stopped. The two
 * are never allowed to look the same.
 */
function GrantCard({
  item,
  onWithdraw,
  withdrawing,
}: {
  item: ConsentGrantItem;
  onWithdraw?: () => void;
  withdrawing?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const skin = STATE_SKIN[item.state] ?? STATE_SKIN.ended;
  const live = item.state === 'active';
  const canWithdraw = live && item.revoke.available && !!onWithdraw;

  const expires = item.expires_at ? new Date(item.expires_at) : null;
  const ended = item.ended_at ? new Date(item.ended_at) : null;
  const granted = item.granted_at ? new Date(item.granted_at) : null;

  return (
    <Card
      variant="flush"
      style={[
        live ? { borderColor: colors.blue } : styles.endedCard,
      ]}
    >
      <ListRow
        icon="building"
        tint={live ? 'blue' : 'purple'}
        title={
          item.facility?.name ??
          t('consentLedger.unknownFacility', { defaultValue: 'Facility not named' })
        }
        meta={[
          item.facility?.type ? formatLabel(item.facility.type) : undefined,
          granted && !Number.isNaN(granted.getTime())
            ? `${t('consentLedger.grantedLabel', { defaultValue: 'Granted' })} ${formatDate(granted)}`
            : undefined,
        ]}
        chevron={false}
        trailing={
          <StatusBadge
            status={item.state}
            tone={skin.tone}
            icon={skin.icon}
            label={item.state_label}
            size="sm"
          />
        }
        divider
      />

      <View style={styles.detail}>
        {/* The server's sentence for this exact state. For an expired grant it
            is the line that stops it reading as live. */}
        <Text style={live ? styles.stateDetail : styles.stateDetailMuted}>{item.state_detail}</Text>

        {/* WHO, when the grant names a person. Absent when it does not — never
            filled in with the facility's name. */}
        {item.clinician ? (
          <Field
            label={t('consentLedger.clinicianLabel', { defaultValue: 'Named clinician' })}
            value={
              item.clinician.name ??
              t('consentLedger.unknownClinician', { defaultValue: 'Clinician not named' })
            }
            icon="person"
          />
        ) : null}

        {/* WHAT they can see. */}
        <View>
          <View style={styles.labelRow}>
            <Icon name="list" size={14} color={colors.textMuted} />
            <Text style={styles.label}>
              {t('consentLedger.scopeLabel', { defaultValue: 'What they can see' })}
            </Text>
          </View>
          {item.scope.length > 0 ? (
            <View style={styles.chips}>
              {item.scope.map((scope) => (
                <Chip
                  key={scope}
                  label={t(`privacy.scope.${scope}`, { defaultValue: formatLabel(scope) })}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.value}>
              {t('consentLedger.scopeUnspecified', { defaultValue: 'Not specified' })}
            </Text>
          )}
        </View>

        {/* WHY, when a request recorded a purpose. */}
        {item.purpose ? (
          <Field
            label={t('consentLedger.purposeLabel', { defaultValue: 'Why' })}
            value={t(`privacy.purpose.${item.purpose}`, { defaultValue: formatLabel(item.purpose) })}
            icon="info"
          />
        ) : null}

        {/* ON WHOSE AUTHORITY. `facility_policy` is the one that matters most:
            the server's sentence says outright that the patient did not
            approve it. */}
        <View style={styles.basisBox}>
          <View style={styles.labelRow}>
            <Icon name="fingerprint" size={14} color={colors.textMuted} />
            <Text style={styles.label}>{item.basis.label}</Text>
          </View>
          <Text style={styles.basisDetail}>{item.basis.detail}</Text>
          <Text style={styles.basisSource}>{item.basis.source_label}</Text>
        </View>

        {/* WHEN it stops, or when it stopped. */}
        <View style={styles.labelRow}>
          <Icon name={live ? 'calendar' : 'clock'} size={14} color={colors.textMuted} />
          <Text style={styles.timing}>
            {live
              ? expires && !Number.isNaN(expires.getTime())
                ? t('consentLedger.expiresLabel', {
                    date: formatDateTime(expires),
                    defaultValue: 'Expires {{date}}',
                  })
                : ''
              : ended && !Number.isNaN(ended.getTime())
                ? t('consentLedger.endedLabel', {
                    date: formatDateTime(ended),
                    defaultValue: 'Ended {{date}}',
                  })
                : ''}
          </Text>
          {live && item.expiring_soon ? (
            <StatusBadge
              status="expiring"
              tone="warning"
              icon="clock"
              label={t('consentLedger.expiringChip', { defaultValue: 'Expiring soon' })}
              size="sm"
            />
          ) : null}
        </View>

        {/* Who ended it. "You withdrew this" and "withdrawn by someone else"
            are different facts, so they are different sentences. */}
        {item.revocation ? (
          <Text style={styles.value}>
            {item.revocation.by_you
              ? t('consentLedger.withdrawnByYou', { defaultValue: 'You withdrew this' })
              : t('consentLedger.withdrawnBySomeoneElse', {
                  defaultValue: 'Withdrawn by someone else',
                })}
          </Text>
        ) : null}

        {/* The withdraw control, on the row that showed the grant. */}
        {live ? (
          canWithdraw ? (
            <TouchableOpacity
              onPress={onWithdraw}
              disabled={withdrawing}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('consentLedger.withdraw', { defaultValue: 'Withdraw access' })}
              accessibilityHint={item.revoke.message}
              accessibilityState={{ disabled: !!withdrawing }}
              style={[styles.withdrawButton, withdrawing && styles.buttonOff]}
            >
              <Icon name="lock" size={18} color={colors.statusCritical} />
              <Text style={styles.withdrawLabel}>
                {t('consentLedger.withdraw', { defaultValue: 'Withdraw access' })}
              </Text>
            </TouchableOpacity>
          ) : (
            /* Not a disabled button — a sentence. The server says WHY it
               cannot be withdrawn from here (most often: this patient record
               has no linked sign-in account, so the revoke endpoint would
               answer 401). A button that always fails teaches nothing. */
            <View style={styles.blockedBox}>
              <Icon name="info" size={16} color={colors.textMuted} />
              <Text style={styles.blockedText}>{item.revoke.message}</Text>
            </View>
          )
        ) : null}
      </View>
    </Card>
  );
}

/**
 * One care relationship. Amber, badged "Not a consent grant", and carrying no
 * withdraw control of any kind — because there is no id here that revoke would
 * accept and no grant here to withdraw.
 */
function RelationshipCard({ item }: { item: CareRelationshipItem }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const since = item.since ? new Date(item.since) : null;

  return (
    <Card variant="flush" style={styles.relationshipCard}>
      <ListRow
        icon={BASIS_ICON[item.basis] ?? 'stethoscope'}
        tint="amber"
        title={
          item.clinician?.name ??
          item.facility?.name ??
          t('consentLedger.unknownClinician', { defaultValue: 'Clinician not named' })
        }
        meta={[
          item.clinician ? item.facility?.name ?? undefined : undefined,
          item.facility?.type ? formatLabel(item.facility.type) : undefined,
          since && !Number.isNaN(since.getTime())
            ? t('consentLedger.sinceLabel', {
                date: formatDate(since),
                defaultValue: 'Since {{date}}',
              })
            : undefined,
        ]}
        chevron={false}
        trailing={
          <StatusBadge
            status="care_relationship"
            tone="warning"
            icon="alert-circle"
            label={t('consentLedger.notAGrant', { defaultValue: 'Not a consent grant' })}
            size="sm"
          />
        }
        divider
      />

      <View style={styles.detail}>
        <Text style={styles.basisTitle}>{item.basis_label}</Text>
        <Text style={styles.stateDetail}>{item.basis_detail}</Text>

        {/* A facility-episode row names no person on purpose, and says so
            rather than leaving a blank where a name would be. */}
        {!item.clinician ? (
          <Text style={styles.value}>
            {t('consentLedger.noClinicianNamed', {
              defaultValue: 'No individual clinician is named on this one',
            })}
          </Text>
        ) : null}

        <View style={styles.blockedBox}>
          <Icon name="info" size={16} color={colors.textMuted} />
          <Text style={styles.blockedText}>
            {t('consentLedger.cannotWithdrawHere', { defaultValue: 'Cannot be withdrawn here' })}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** A labelled line inside a card body. */
function Field({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View>
      <View style={styles.labelRow}>
        <Icon name={icon} size={14} color={colors.textMuted} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/** One figure in the summary card. */
function SummaryRow({
  icon,
  tint,
  value,
  label,
  caption,
  divider,
}: {
  icon: IconName;
  tint: Tint;
  value: number;
  label: string;
  caption: string;
  divider?: boolean;
}) {
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ListRow
      icon={icon}
      tint={tint}
      title={label}
      subtitle={caption}
      chevron={false}
      divider={divider}
      accessibilityLabel={`${value} ${label}. ${caption}`}
      trailing={<Text style={[styles.statValue, { color: tintMap[tint].fg }]}>{String(value)}</Text>}
    />
  );
}

/** Tinted inline notice: icon in a status circle, optional title, body. */
function Notice({
  tone,
  icon,
  title,
  body,
}: {
  tone: StatusTone;
  icon: IconName;
  title?: string;
  body: string;
}) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = statusMap[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: skin.bg }]}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.noticeIcon, { backgroundColor: colors.surface }]}>
        <Icon name={icon} size={20} color={skin.fg} />
      </View>
      <View style={styles.noticeBody}>
        {title ? <Text style={[styles.noticeTitle, { color: skin.fg }]}>{title}</Text> : null}
        <Text style={styles.noticeText}>{body}</Text>
      </View>
    </View>
  );
}

// ── Styles (colour-dependent, built per palette) ───────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },

    stack: { gap: spacing.sm + 4 },
    stackTop: { marginTop: spacing.sm + 4 },

    loading: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

    sectionHint: {
      marginBottom: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    statValue: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.lg },

    // Cards
    endedCard: { backgroundColor: colors.surfaceMuted, borderColor: colors.divider },
    relationshipCard: { borderColor: colors.statusWarning },

    detail: { padding: spacing.md, gap: spacing.sm + 4 },

    stateDetail: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    stateDetailMuted: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },

    labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
    label: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    value: {
      marginTop: spacing.xs,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    chips: { marginTop: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

    basisBox: {
      gap: spacing.xs,
      padding: spacing.sm + 2,
      borderRadius: radii.sm,
      backgroundColor: colors.page,
    },
    basisTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    basisDetail: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    basisSource: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },

    timing: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },

    withdrawButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: 50,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.statusCriticalBg,
      backgroundColor: colors.statusCriticalBg,
    },
    buttonOff: { opacity: 0.5 },
    withdrawLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.statusCritical,
    },

    blockedBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: radii.sm,
      backgroundColor: colors.page,
    },
    blockedText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      padding: spacing.md,
      borderRadius: radii.md,
    },
    noticeIcon: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noticeBody: { flex: 1, minWidth: 0, gap: 2 },
    noticeTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
    noticeText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
  });
