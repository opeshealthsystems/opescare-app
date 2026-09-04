import { useMemo } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatLabel,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type Tint,
} from '@/components/opes-ui';
import {
  CareButton,
  DEPARTMENT_TYPE_ICON,
  ErrorBlock,
  InfoRow,
  LoadingBlock,
  NoticeBanner,
  ProviderAvatar,
  departmentTypeLabel,
  type DepartmentType,
  type Translate,
} from '@/components/care/shared';
import {
  useFacilityDetail,
  useFacilityProviders,
  useFacilitySlots,
  type CareFacilityHour,
  type CareFacilityService,
} from '@/lib/api/queries';
import {
  joinLocationParts,
  openStateToday,
  telUrl,
  trimTime,
  weekdayLabel,
  websiteUrl,
  type OpenState,
} from '@/lib/careMap/facilityDisplay';

/**
 * Facility profile — the drill-in from Care Access and the booking flow's
 * facility picker. Presentation is the OPES CARE-005 profile layout
 * (`UIUX/src/screens/care/FacilityProfileScreen.tsx`) ported onto this
 * app's existing data layer; nothing below fetches differently than before.
 *
 * The honest-bookability rule lives here. Of the 903 listed institutions only
 * **17** are linked to an internal `facilities` row and therefore have
 * appointment slots; `GET /mobile/facilities/{id}/slots` answers
 * `{"facility_id": null, "data": []}` for the other 886. Offering "Book an
 * appointment" on all of them dead-ends the patient in an empty slot picker, so
 * the booking card below reads that response and says which of three situations
 * this facility is in — not connected, connected but nothing open, or bookable
 * right now — and only the last one shows a booking CTA.
 *
 * Where the facility is stays an *embedded* map (`FacilityMap`, the finder's
 * in-app map with in-app directions). There is deliberately no external
 * maps link on this screen.
 */

/**
 * Kit glyph for each `care_facilities.facility_type`. The care map keeps its
 * Lucide set; this screen is kit-only. The kit has no tooth glyph yet, so
 * dental falls back to the first-aid cross.
 */
const FACILITY_TYPE_ICON: Record<string, IconName> = {
  hospital: 'building',
  clinic: 'stethoscope',
  health_center: 'first-aid',
  pharmacy: 'pill',
  laboratory: 'flask',
  dental: 'first-aid',
  diagnostic_center: 'microscope',
  imaging_center: 'image',
  blood_bank: 'droplet',
};

const facilityTypeIcon = (type: string): IconName => FACILITY_TYPE_ICON[type] ?? 'location';

/**
 * `care_facility_services.service_category` is free text seeded from a small
 * vocabulary ("emergency, diagnostic, consultation, lab, imaging…"). Fold it
 * onto the kit's department types so every service row gets the same icon its
 * department would in the finder.
 */
const SERVICE_CATEGORY_TYPE: Record<string, DepartmentType> = {
  clinic: 'clinic',
  clinical: 'clinic',
  consultation: 'clinic',
  procedure: 'clinic',
  surgery: 'clinic',
  laboratory: 'laboratory',
  lab: 'laboratory',
  diagnostic: 'laboratory',
  pharmacy: 'pharmacy',
  imaging: 'imaging',
  radiology: 'imaging',
  emergency: 'emergency',
};

const SERVICE_TINT: Record<DepartmentType, Tint> = {
  clinic: 'blue',
  laboratory: 'green',
  pharmacy: 'green',
  imaging: 'purple',
  emergency: 'red',
};

function serviceDepartmentType(category: string | null): DepartmentType | null {
  if (!category) return null;
  return SERVICE_CATEGORY_TYPE[category.trim().toLowerCase().replace(/[\s-]+/g, '_')] ?? null;
}

/** "Open · closes 17:00" / "Closed · opens 08:00" as a kit status pill. */
function OpenStateBadge({ state }: { state: OpenState }) {
  const { t } = useTranslation();
  if (state.kind === 'unknown') return null;

  const isOpen = state.kind === 'open' || state.kind === 'open24';
  const label =
    state.kind === 'open24'
      ? t('facility.open24')
      : state.kind === 'open'
        ? t('facility.openUntil', { time: state.until })
        : state.kind === 'closedNow'
          ? t('facility.closedUntil', { time: state.opensAt })
          : t('facility.closedToday');

  return (
    <StatusBadge
      status={isOpen ? 'open' : 'closed'}
      tone={isOpen ? 'normal' : state.kind === 'closedNow' ? 'warning' : 'neutral'}
      label={label}
      icon="clock"
      size="sm"
      style={{ alignSelf: 'flex-start' }}
    />
  );
}

/** The circular quick action under the identity block (Call / Email / Website / Share). */
function CircleAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.action, disabled && styles.actionOff]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <View style={styles.actionCircle}>
        <Icon name={icon} size={22} color={colors.blue} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ServiceRow({
  service,
  divider,
  tr,
}: {
  service: CareFacilityService;
  divider: boolean;
  tr: Translate;
}) {
  const type = serviceDepartmentType(service.service_category);
  return (
    <ListRow
      icon={type ? DEPARTMENT_TYPE_ICON[type] : 'clipboard'}
      tint={type ? SERVICE_TINT[type] : 'blue'}
      title={service.service_name}
      meta={[
        service.service_category ? departmentTypeLabel(tr, type ?? service.service_category) : null,
        service.specialty,
        service.appointment_required ? tr('facility.appointmentRequired') : null,
        service.walk_in_allowed ? tr('facility.walkInAllowed') : null,
      ]}
      divider={divider}
    />
  );
}

export default function FacilityDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ id?: string }>();
  const facilityId = params.id;

  // The shared care helpers take a plain `(key, params) => string`; i18next's
  // `t` is that, minus its overload noise.
  const tr: Translate = (key, options) => String(t(key, options));

  const facilityQuery = useFacilityDetail(facilityId);
  const providersQuery = useFacilityProviders(facilityId);
  const slotsQuery = useFacilitySlots(facilityId);

  const facility = facilityQuery.data;
  const providers = providersQuery.data?.data ?? [];
  const insurances = facility?.insurances ?? [];
  const services = facility?.services ?? [];

  const hours = useMemo(
    () =>
      [...(facility?.hours ?? [])].sort(
        (a: CareFacilityHour, b: CareFacilityHour) => a.day_of_week - b.day_of_week,
      ),
    [facility?.hours],
  );

  const openState = useMemo<OpenState>(() => openStateToday(hours), [hours]);
  const todayIndex = new Date().getDay();

  const address = facility
    ? joinLocationParts(facility.address, facility.city, facility.region)
    : '';
  const hasCoords = facility?.latitude != null && facility?.longitude != null;

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  /* ── Bookability, read straight off the slots endpoint ─────────────── */
  const slots = slotsQuery.data?.data ?? [];
  const isLinkedForBooking = !!slotsQuery.data?.facility_id;
  const nextSlot = slots.length > 0 ? slots[0] : null;

  const nextSlotLabel = nextSlot
    ? new Date(nextSlot.starts_at).toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  /* ── Actions — every one the previous screen offered survives ──────── */
  const goToBooking = () => {
    if (!facility) return;
    router.push({ pathname: '/appointments/book', params: { facilityId: facility.id } });
  };

  const callFacility = () => {
    if (facility?.phone_primary) openUrl(telUrl(facility.phone_primary));
  };

  const emailFacility = () => {
    if (facility?.email) openUrl(`mailto:${facility.email}`);
  };

  const openWebsite = () => {
    if (facility?.website) openUrl(websiteUrl(facility.website));
  };

  const shareFacility = () => {
    if (!facility) return;
    const line = [facility.facility_name, address, facility.phone_primary].filter(Boolean).join(' · ');
    Share.share({ message: line }).catch(() => {});
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  const contactRows = facility
    ? [
        facility.phone_primary
          ? {
              key: 'phone',
              icon: 'phone' as IconName,
              title: t('facility.phone'),
              value: facility.phone_primary,
              onPress: callFacility,
            }
          : null,
        facility.phone_secondary
          ? {
              key: 'phone2',
              icon: 'phone' as IconName,
              title: t('facility.phone'),
              value: facility.phone_secondary,
              onPress: () => openUrl(telUrl(facility.phone_secondary as string)),
            }
          : null,
        facility.email
          ? {
              key: 'email',
              icon: 'mail' as IconName,
              title: t('facility.email'),
              value: facility.email,
              onPress: emailFacility,
            }
          : null,
        facility.website
          ? {
              key: 'website',
              icon: 'globe' as IconName,
              title: t('facility.website'),
              value: facility.website,
              onPress: openWebsite,
            }
          : null,
      ].filter((row): row is NonNullable<typeof row> => row !== null)
    : [];

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('facility.title')}
        subtitle={t('facility.profileSubtitle', {
          defaultValue: 'Details, services, clinicians and opening hours.',
        })}
        onBack={goBack}
      />

      {facilityQuery.isLoading ? (
        <LoadingBlock label={t('facility.loading', { defaultValue: 'Loading facility…' })} />
      ) : facilityQuery.isError || !facility ? (
        <ErrorBlock message={t('facility.loadError')} onRetry={() => facilityQuery.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* ── Identity ──────────────────────────────────────────────── */}
          <Card>
            <View style={styles.identity}>
              <View style={styles.thumb}>
                <Icon name={facilityTypeIcon(facility.facility_type)} size={34} color={colors.blue} />
              </View>
              <View style={styles.identityBody}>
                <Text style={styles.name} numberOfLines={2}>
                  {facility.facility_name}
                </Text>
                <View style={styles.tagRow}>
                  <StatusBadge
                    status={facility.facility_type}
                    tone="neutral"
                    size="sm"
                    label={t(`careMap.types.${facility.facility_type}`, {
                      defaultValue: formatLabel(facility.facility_type),
                    })}
                  />
                  {facility.ownership_type ? (
                    <StatusBadge
                      status={facility.ownership_type}
                      tone="neutral"
                      size="sm"
                      label={t(`facility.ownership.${facility.ownership_type}`, {
                        defaultValue: formatLabel(facility.ownership_type),
                      })}
                    />
                  ) : null}
                </View>
                <View style={styles.metaRow}>
                  <Icon name="location" size={16} color={colors.textSecondary} />
                  <Text style={styles.meta}>{address || '—'}</Text>
                </View>
                <OpenStateBadge state={openState} />
              </View>
            </View>

            <View style={styles.actions}>
              <CircleAction
                icon="phone"
                label={t('facility.callAction')}
                disabled={!facility.phone_primary}
                onPress={callFacility}
              />
              <CircleAction
                icon="mail"
                label={t('facility.email')}
                disabled={!facility.email}
                onPress={emailFacility}
              />
              <CircleAction
                icon="globe"
                label={t('facility.website')}
                disabled={!facility.website}
                onPress={openWebsite}
              />
              <CircleAction
                icon="share"
                label={t('opesCare.facilityProfile.share')}
                onPress={shareFacility}
              />
            </View>
          </Card>

          {/* ── Where it is: embedded, in-app map (no external maps app) ─ */}
          {hasCoords ? (
            <View>
              <SectionHeader title={t('opesCare.facilityProfile.location')} variant="overline" />
              <Card variant="flush">
                <FacilityMap
                  facilities={{
                    id: facility.id,
                    name: facility.facility_name,
                    latitude: facility.latitude,
                    longitude: facility.longitude,
                    city: facility.city,
                    region: facility.region,
                    type: facility.facility_type,
                    phone: facility.phone_primary,
                  }}
                  height={200}
                  directions
                />
              </Card>
            </View>
          ) : null}

          {/* ── Appointments: state of the real slot link ─────────────── */}
          <View>
            <SectionHeader title={t('facility.booking.title')} variant="overline" />
            <Card>
              {slotsQuery.isLoading ? (
                <View style={styles.checking}>
                  <ActivityIndicator size="small" color={colors.blue} />
                  <Text style={styles.checkingText}>{t('facility.booking.checking')}</Text>
                </View>
              ) : slotsQuery.isError ? (
                <NoticeBanner
                  tone="warning"
                  icon="alert-triangle"
                  message={t('facility.booking.errorBody')}
                />
              ) : !isLinkedForBooking ? (
                <View style={styles.stack}>
                  <NoticeBanner
                    tone="pending"
                    icon="info"
                    title={t('facility.booking.unavailableTitle')}
                    message={t('facility.booking.unavailableBody')}
                  />
                  {facility.phone_primary ? (
                    <CareButton
                      variant="secondary"
                      icon="phone"
                      label={t('facility.booking.callInstead')}
                      onPress={callFacility}
                    />
                  ) : null}
                </View>
              ) : slots.length === 0 ? (
                <View style={styles.stack}>
                  <NoticeBanner
                    tone="pending"
                    icon="clock"
                    title={t('facility.booking.noSlotsTitle')}
                    message={t('facility.booking.noSlotsBody')}
                  />
                  <CareButton
                    variant="secondary"
                    icon="calendar"
                    label={t('facility.booking.checkDates')}
                    onPress={goToBooking}
                  />
                </View>
              ) : (
                <View style={styles.stack}>
                  <NoticeBanner
                    tone="normal"
                    icon="shield-check"
                    title={t('facility.booking.availableTitle')}
                    // Deliberately not named `count`: that key triggers
                    // i18next's plural resolution, which would look for
                    // `availableBody_one` / `_other` instead of this key.
                    message={t('facility.booking.availableBody', {
                      slotCount: slots.length,
                      when: nextSlotLabel ?? '',
                    })}
                  />
                  <GradientButton label={t('facility.bookHere')} onPress={goToBooking} />
                </View>
              )}
            </Card>
          </View>

          {/* ── About ─────────────────────────────────────────────────── */}
          {facility.description ? (
            <View>
              <SectionHeader title={t('facility.aboutTitle')} variant="overline" />
              <Card>
                <Text style={styles.about}>{facility.description}</Text>
              </Card>
            </View>
          ) : null}

          {/* ── Doctors & specialists ─────────────────────────────────── */}
          <View>
            <SectionHeader
              title={
                providers.length > 0
                  ? `${t('facility.doctorsTitle')} (${providers.length})`
                  : t('facility.doctorsTitle')
              }
            />
            {providersQuery.isLoading ? (
              <Card>
                <View style={styles.checking}>
                  <ActivityIndicator size="small" color={colors.blue} />
                  <Text style={styles.checkingText}>{t('facility.doctorsSubtitle')}</Text>
                </View>
              </Card>
            ) : providersQuery.isError ? (
              <Card>
                <EmptyState
                  icon="alert-circle"
                  tint="red"
                  title={t('facility.loadDoctorsError')}
                  actionLabel={t('facility.retry')}
                  onAction={() => providersQuery.refetch()}
                />
              </Card>
            ) : providers.length === 0 ? (
              <Card>
                <EmptyState
                  icon="stethoscope"
                  title={t('facility.noDoctors')}
                  message={t('facility.doctorsSubtitle')}
                />
              </Card>
            ) : (
              <Card variant="flush">
                {providers.map((provider, index) => (
                  <ListRow
                    key={provider.id}
                    leading={<ProviderAvatar name={provider.name} size={44} />}
                    title={provider.name}
                    meta={[provider.job_title, provider.department]}
                    onPress={() => router.push(`/doctor/${provider.id}`)}
                    divider={index < providers.length - 1}
                  />
                ))}
              </Card>
            )}
          </View>

          {/* ── Services ──────────────────────────────────────────────── */}
          <View>
            <SectionHeader title={t('facility.servicesTitle')} variant="overline" />
            {services.length === 0 ? (
              <Card>
                <EmptyState icon="clipboard" title={t('facility.noServices')} />
              </Card>
            ) : (
              <Card variant="flush">
                {services.map((service, index) => (
                  <ServiceRow
                    key={`${service.service_name}-${index}`}
                    service={service}
                    divider={index < services.length - 1}
                    tr={tr}
                  />
                ))}
              </Card>
            )}
          </View>

          {/* ── Opening hours ─────────────────────────────────────────── */}
          <View>
            <SectionHeader title={t('facility.hoursTitle')} variant="overline" />
            {hours.length === 0 ? (
              <Card>
                <EmptyState icon="clock" title={t('facility.hoursUnknown')} />
              </Card>
            ) : (
              <Card variant="flush">
                <View style={styles.rowsPad}>
                  {hours.map((hour, index) => {
                    const isToday = hour.day_of_week === todayIndex;
                    const day = weekdayLabel(hour.day_of_week, i18n.language);
                    return (
                      <InfoRow
                        key={`${hour.day_of_week}-${index}`}
                        icon="clock"
                        tint={isToday ? 'blue' : 'purple'}
                        label={isToday ? `${day} · ${t('facility.todayLabel')}` : day}
                        value={
                          hour.is_24_hours
                            ? t('facility.open24')
                            : hour.is_closed
                              ? t('facility.closed')
                              : `${trimTime(hour.opens_at) ?? '—'} – ${trimTime(hour.closes_at) ?? '—'}`
                        }
                        valueColor={isToday ? colors.link : undefined}
                        divider={index < hours.length - 1}
                      />
                    );
                  })}
                </View>
              </Card>
            )}
          </View>

          {/* ── Accepted insurance ────────────────────────────────────── */}
          {insurances.length > 0 ? (
            <View>
              <SectionHeader title={t('facility.insurancesTitle')} variant="overline" />
              <Card variant="flush">
                {insurances.map((insurance, index) => (
                  <ListRow
                    key={`${insurance.insurance_name}-${index}`}
                    icon="shield-check"
                    tint="green"
                    title={insurance.insurance_name}
                    subtitle={t('facility.insurancesSubtitle')}
                    trailing={
                      insurance.cashless_available ? (
                        <StatusBadge
                          status="cashless"
                          tone="normal"
                          size="sm"
                          label={t('facility.insuranceCashless')}
                        />
                      ) : undefined
                    }
                    divider={index < insurances.length - 1}
                  />
                ))}
              </Card>
            </View>
          ) : null}

          {/* ── Contact ───────────────────────────────────────────────── */}
          {contactRows.length > 0 ? (
            <View>
              <SectionHeader title={t('facility.contactTitle')} variant="overline" />
              <Card variant="flush">
                {contactRows.map((row, index) => (
                  <ListRow
                    key={row.key}
                    icon={row.icon}
                    title={row.title}
                    subtitle={row.value}
                    onPress={row.onPress}
                    divider={index < contactRows.length - 1}
                  />
                ))}
              </Card>
            </View>
          ) : null}

          <Text style={styles.note}>{t('facility.directoryNote')}</Text>
        </ScrollView>
      )}
    </Screen>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

    identity: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 2 },
    thumb: {
      width: 82,
      height: 82,
      borderRadius: radii.md,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    identityBody: { flex: 1, minWidth: 0, gap: 6 },
    name: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textPrimary,
    },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    meta: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },

    actions: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    action: { alignItems: 'center', gap: 6 },
    actionOff: { opacity: 0.4 },
    actionCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textPrimary,
    },

    about: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },

    checking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, paddingVertical: 2 },
    checkingText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    stack: { gap: spacing.md },

    rowsPad: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },

    note: {
      marginTop: spacing.sm,
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
  });
