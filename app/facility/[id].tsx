import { useMemo } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ArrowLeft,
  CalendarPlus,
  CalendarX,
  ChevronRight,
  Clock,
  Globe,
  Mail,
  MapPin,
  Navigation,
  Phone,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { colors } from '../../theme/tokens';
import {
  useFacilityDetail,
  useFacilityProviders,
  useFacilitySlots,
  type CareFacilityHour,
  type FacilityProviderSummary,
} from '../../lib/api/queries';
import {
  directionsUrl,
  iconForFacilityType,
  joinLocationParts,
  openStateToday,
  telUrl,
  trimTime,
  weekdayLabel,
  websiteUrl,
  type OpenState,
} from '../../lib/careMap/facilityDisplay';

/**
 * Facility profile — the drill-in from Care Access and the booking flow's
 * facility picker.
 *
 * The honest-bookability rule lives here. Of the 903 listed institutions only
 * **17** are linked to an internal `facilities` row and therefore have
 * appointment slots; `GET /mobile/facilities/{id}/slots` answers
 * `{"facility_id": null, "data": []}` for the other 886. Offering "Book an
 * appointment" on all of them dead-ends the patient in an empty slot picker, so
 * the booking card below reads that response and says which of three situations
 * this facility is in — not connected, connected but nothing open, or bookable
 * right now — and only the last one shows a booking CTA.
 */

/** Two-letter monogram — staff_profiles carries no photo column, so avatars are initials. */
function providerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className="mb-2 mt-6">
      <Text className="text-sm font-bold text-navy-text">{title}</Text>
      {subtitle ? <Text className="text-xs text-navy-muted">{subtitle}</Text> : null}
    </View>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-cream-200 px-2.5 py-1">
      <Text className="text-[10px] font-semibold uppercase text-navy-secondary">{label}</Text>
    </View>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const body = (
    <View className="flex-row items-center py-3">
      <Icon size={16} color={colors.brand[600]} />
      <View className="ml-3 flex-1">
        <Text className="text-xs text-navy-muted">{label}</Text>
        <Text className="mt-0.5 text-sm font-semibold text-navy-text">{value}</Text>
      </View>
      {onPress ? <ChevronRight size={16} color={colors.navy.muted} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

function ProviderRow({
  provider,
  onPress,
}: {
  provider: FacilityProviderSummary;
  onPress: () => void;
}) {
  const subtitle = [provider.job_title, provider.department].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} className="mb-3 flex-row items-center rounded-2xl bg-white p-4">
      <View
        className="h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.brand[50] }}
      >
        <Text className="text-sm font-extrabold text-brand-600">
          {providerInitials(provider.name)}
        </Text>
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-base font-bold text-navy-text" numberOfLines={1}>
          {provider.name}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-xs text-navy-secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.navy.muted} />
    </Pressable>
  );
}

/** Small "Open now / Closed / Open 24 hours" pill derived from published hours. */
function OpenStatePill({ state, t }: { state: OpenState; t: TFunction }) {
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
    <View
      className="self-start rounded-full px-2.5 py-1"
      style={{
        backgroundColor: isOpen ? colors.semantic.successSurface : colors.cream[200],
      }}
    >
      <Text
        className="text-[10px] font-bold"
        style={{ color: isOpen ? colors.semantic.success : colors.navy.secondary }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function FacilityDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const facilityId = params.id;

  const facilityQuery = useFacilityDetail(facilityId);
  const providersQuery = useFacilityProviders(facilityId);
  const slotsQuery = useFacilitySlots(facilityId);

  const facility = facilityQuery.data;
  const providers = providersQuery.data?.data ?? [];
  const insurances = facility?.insurances ?? [];

  const hours = useMemo(
    () =>
      [...(facility?.hours ?? [])].sort(
        (a: CareFacilityHour, b: CareFacilityHour) => a.day_of_week - b.day_of_week,
      ),
    [facility?.hours],
  );

  const openState = useMemo<OpenState>(() => openStateToday(hours), [hours]);

  const mapsUrl = facility ? directionsUrl(facility) : null;
  const todayIndex = new Date().getDay();

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

  const goToBooking = () => {
    if (!facility) return;
    router.push({ pathname: '/appointments/book', params: { facilityId: facility.id } });
  };

  const callFacility = () => {
    if (facility?.phone_primary) openUrl(telUrl(facility.phone_primary));
  };

  return (
    <Screen className="px-0">
      <View className="flex-row items-center px-6 pt-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full border border-brand-300"
        >
          <ArrowLeft size={18} color={colors.brand[600]} />
        </Pressable>
        <Text className="ml-4 flex-1 text-lg font-extrabold text-navy-text" numberOfLines={1}>
          {facility?.facility_name ?? t('facility.title')}
        </Text>
      </View>

      {facilityQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand[500]} />
        </View>
      ) : facilityQuery.isError || !facility ? (
        <View className="flex-1 items-center justify-center px-10">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-brand-50">
            <TriangleAlert size={26} color={colors.brand[500]} />
          </View>
          <Text className="text-center text-sm text-navy-secondary">{t('facility.loadError')}</Text>
          <Pressable
            onPress={() => facilityQuery.refetch()}
            className="mt-4 rounded-xl px-5 py-2.5"
            style={{ backgroundColor: colors.brand[500] }}
          >
            <Text className="text-sm font-semibold text-white">{t('facility.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* ── Identity ──────────────────────────────────────────────── */}
          <View className="rounded-2xl bg-white p-4">
            <View className="flex-row items-start">
              <View
                className="mr-3 h-12 w-12 items-center justify-center rounded-2xl"
                style={{ backgroundColor: colors.brand[50] }}
              >
                {(() => {
                  const Icon = iconForFacilityType(facility.facility_type);
                  return <Icon size={22} color={colors.brand[600]} />;
                })()}
              </View>
              <View className="flex-1">
                <Text className="text-lg font-extrabold text-navy-text">
                  {facility.facility_name}
                </Text>
                <View className="mt-1 flex-row items-start">
                  <MapPin size={12} color={colors.navy.muted} style={{ marginTop: 2 }} />
                  <Text className="ml-1 flex-1 text-xs text-navy-secondary">
                    {joinLocationParts(facility.address, facility.city, facility.region) || '—'}
                  </Text>
                </View>
                <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 6 }}>
                  <Tag
                    label={t(`careMap.types.${facility.facility_type}`, {
                      defaultValue: facility.facility_type,
                    })}
                  />
                  {facility.ownership_type ? (
                    <Tag
                      label={t(`facility.ownership.${facility.ownership_type}`, {
                        defaultValue: facility.ownership_type,
                      })}
                    />
                  ) : null}
                  <OpenStatePill state={openState} t={t} />
                </View>
              </View>
            </View>

            <View className="mt-4 flex-row" style={{ gap: 8 }}>
              {facility.phone_primary ? (
                <Pressable
                  onPress={callFacility}
                  className="flex-1 flex-row items-center justify-center rounded-2xl py-3"
                  style={{ backgroundColor: colors.brand[500] }}
                >
                  <Phone size={15} color={colors.white} />
                  <Text className="ml-2 text-sm font-semibold text-white">
                    {t('facility.callAction')}
                  </Text>
                </Pressable>
              ) : null}
              {mapsUrl ? (
                <Pressable
                  onPress={() => openUrl(mapsUrl)}
                  className="flex-1 flex-row items-center justify-center rounded-2xl border py-3"
                  style={{ borderColor: colors.brand[300] }}
                >
                  <Navigation size={15} color={colors.brand[600]} />
                  <Text className="ml-2 text-sm font-semibold text-brand-600">
                    {t('facility.getDirections')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* ── Appointments: state of the real slot link ─────────────── */}
          <SectionTitle title={t('facility.booking.title')} />
          <View className="rounded-2xl bg-white p-4">
            {slotsQuery.isLoading ? (
              <View className="flex-row items-center py-1">
                <ActivityIndicator size="small" color={colors.brand[500]} />
                <Text className="ml-3 text-sm text-navy-secondary">
                  {t('facility.booking.checking')}
                </Text>
              </View>
            ) : slotsQuery.isError ? (
              <View className="flex-row items-start">
                <TriangleAlert size={16} color={colors.semantic.warning} style={{ marginTop: 2 }} />
                <Text className="ml-3 flex-1 text-sm text-navy-secondary">
                  {t('facility.booking.errorBody')}
                </Text>
              </View>
            ) : !isLinkedForBooking ? (
              <View>
                <View className="flex-row items-start">
                  <CalendarX size={16} color={colors.navy.muted} style={{ marginTop: 2 }} />
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-bold text-navy-text">
                      {t('facility.booking.unavailableTitle')}
                    </Text>
                    <Text className="mt-1 text-xs leading-4 text-navy-secondary">
                      {t('facility.booking.unavailableBody')}
                    </Text>
                  </View>
                </View>
                {facility.phone_primary ? (
                  <Pressable
                    onPress={callFacility}
                    className="mt-3 flex-row items-center justify-center rounded-xl border py-2.5"
                    style={{ borderColor: colors.brand[300] }}
                  >
                    <Phone size={14} color={colors.brand[600]} />
                    <Text className="ml-2 text-xs font-semibold text-brand-600">
                      {t('facility.booking.callInstead')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : slots.length === 0 ? (
              <View>
                <View className="flex-row items-start">
                  <Clock size={16} color={colors.navy.muted} style={{ marginTop: 2 }} />
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-bold text-navy-text">
                      {t('facility.booking.noSlotsTitle')}
                    </Text>
                    <Text className="mt-1 text-xs leading-4 text-navy-secondary">
                      {t('facility.booking.noSlotsBody')}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={goToBooking}
                  className="mt-3 flex-row items-center justify-center rounded-xl border py-2.5"
                  style={{ borderColor: colors.brand[300] }}
                >
                  <CalendarPlus size={14} color={colors.brand[600]} />
                  <Text className="ml-2 text-xs font-semibold text-brand-600">
                    {t('facility.booking.checkDates')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View>
                <View className="flex-row items-start">
                  <ShieldCheck
                    size={16}
                    color={colors.semantic.success}
                    style={{ marginTop: 2 }}
                  />
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-bold text-navy-text">
                      {t('facility.booking.availableTitle')}
                    </Text>
                    <Text className="mt-1 text-xs leading-4 text-navy-secondary">
                      {/* Deliberately not named `count`: that key triggers
                          i18next's plural resolution, which would look for
                          `availableBody_one` / `_other` instead of this key. */}
                      {t('facility.booking.availableBody', {
                        slotCount: slots.length,
                        when: nextSlotLabel ?? '',
                      })}
                    </Text>
                  </View>
                </View>
                <View className="mt-4">
                  <Button
                    label={t('facility.bookHere')}
                    leftIcon={CalendarPlus}
                    onPress={goToBooking}
                  />
                </View>
              </View>
            )}
          </View>

          {/* ── About ─────────────────────────────────────────────────── */}
          {facility.description ? (
            <>
              <SectionTitle title={t('facility.aboutTitle')} />
              <View className="rounded-2xl bg-white p-4">
                <Text className="text-sm leading-5 text-navy-secondary">{facility.description}</Text>
              </View>
            </>
          ) : null}

          {/* ── Doctors & specialists ─────────────────────────────────── */}
          <View className="mb-2 mt-6 flex-row items-end justify-between">
            <View className="flex-1">
              <Text className="text-sm font-bold text-navy-text">{t('facility.doctorsTitle')}</Text>
              <Text className="text-xs text-navy-muted">{t('facility.doctorsSubtitle')}</Text>
            </View>
            <Stethoscope size={18} color={colors.brand[600]} />
          </View>

          {providersQuery.isLoading ? (
            <View className="items-center py-6">
              <ActivityIndicator color={colors.brand[500]} />
            </View>
          ) : providersQuery.isError ? (
            <View className="rounded-2xl bg-white p-4">
              <Text className="text-sm text-navy-secondary">{t('facility.loadDoctorsError')}</Text>
            </View>
          ) : providers.length === 0 ? (
            <View className="rounded-2xl bg-white p-4">
              <Text className="text-sm text-navy-secondary">{t('facility.noDoctors')}</Text>
            </View>
          ) : (
            providers.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                onPress={() => router.push(`/doctor/${provider.id}`)}
              />
            ))
          )}

          {/* ── Services ──────────────────────────────────────────────── */}
          <SectionTitle title={t('facility.servicesTitle')} />
          {facility.services.length === 0 ? (
            <View className="rounded-2xl bg-white p-4">
              <Text className="text-sm text-navy-secondary">{t('facility.noServices')}</Text>
            </View>
          ) : (
            <View className="rounded-2xl bg-white p-4">
              {facility.services.map((service, index) => (
                <View
                  key={`${service.service_name}-${index}`}
                  className="py-2.5"
                  style={
                    index > 0 ? { borderTopWidth: 1, borderTopColor: colors.cream[300] } : undefined
                  }
                >
                  <Text className="text-sm font-semibold text-navy-text">
                    {service.service_name}
                  </Text>
                  <View className="mt-1.5 flex-row flex-wrap items-center" style={{ gap: 6 }}>
                    {service.specialty ? <Tag label={service.specialty} /> : null}
                    {service.appointment_required ? (
                      <Tag label={t('facility.appointmentRequired')} />
                    ) : null}
                    {service.walk_in_allowed ? <Tag label={t('facility.walkInAllowed')} /> : null}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── Opening hours ─────────────────────────────────────────── */}
          {hours.length > 0 ? (
            <>
              <SectionTitle title={t('facility.hoursTitle')} />
              <View className="rounded-2xl bg-white p-4">
                {hours.map((hour, index) => {
                  const isToday = hour.day_of_week === todayIndex;
                  return (
                    <View
                      key={`${hour.day_of_week}-${index}`}
                      className="flex-row items-center justify-between py-2"
                      style={
                        index > 0
                          ? { borderTopWidth: 1, borderTopColor: colors.cream[300] }
                          : undefined
                      }
                    >
                      <View className="flex-row items-center">
                        <Clock
                          size={14}
                          color={isToday ? colors.brand[600] : colors.navy.muted}
                        />
                        <Text
                          className={`ml-2 text-sm ${isToday ? 'font-bold text-navy-text' : 'text-navy-secondary'}`}
                        >
                          {weekdayLabel(hour.day_of_week, i18n.language)}
                        </Text>
                        {isToday ? (
                          <View
                            className="ml-2 rounded-full px-2 py-0.5"
                            style={{ backgroundColor: colors.brand[50] }}
                          >
                            <Text className="text-[9px] font-bold uppercase text-brand-600">
                              {t('facility.todayLabel')}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text
                        className={`text-sm ${isToday ? 'font-bold text-navy-text' : 'font-semibold text-navy-secondary'}`}
                      >
                        {hour.is_24_hours
                          ? t('facility.open24')
                          : hour.is_closed
                            ? t('facility.closed')
                            : `${trimTime(hour.opens_at) ?? '—'} – ${trimTime(hour.closes_at) ?? '—'}`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <SectionTitle title={t('facility.hoursTitle')} />
              <View className="rounded-2xl bg-white p-4">
                <Text className="text-sm text-navy-secondary">{t('facility.hoursUnknown')}</Text>
              </View>
            </>
          )}

          {/* ── Accepted insurance ────────────────────────────────────── */}
          {insurances.length > 0 ? (
            <>
              <SectionTitle
                title={t('facility.insurancesTitle')}
                subtitle={t('facility.insurancesSubtitle')}
              />
              <View className="rounded-2xl bg-white p-4">
                {insurances.map((insurance, index) => (
                  <View
                    key={`${insurance.insurance_name}-${index}`}
                    className="flex-row items-center justify-between py-2.5"
                    style={
                      index > 0
                        ? { borderTopWidth: 1, borderTopColor: colors.cream[300] }
                        : undefined
                    }
                  >
                    <Text className="mr-3 flex-1 text-sm font-semibold text-navy-text">
                      {insurance.insurance_name}
                    </Text>
                    {insurance.cashless_available ? (
                      <View
                        className="rounded-full px-2.5 py-1"
                        style={{ backgroundColor: colors.semantic.successSurface }}
                      >
                        <Text
                          className="text-[10px] font-bold"
                          style={{ color: colors.semantic.success }}
                        >
                          {t('facility.insuranceCashless')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* ── Contact ───────────────────────────────────────────────── */}
          {facility.phone_primary || facility.email || facility.website ? (
            <>
              <SectionTitle title={t('facility.contactTitle')} />
              <View className="rounded-2xl bg-white px-4">
                {facility.phone_primary ? (
                  <ContactRow
                    icon={Phone}
                    label={t('facility.phone')}
                    value={facility.phone_primary}
                    onPress={callFacility}
                  />
                ) : null}
                {facility.email ? (
                  <ContactRow
                    icon={Mail}
                    label={t('facility.email')}
                    value={facility.email}
                    onPress={() => openUrl(`mailto:${facility.email}`)}
                  />
                ) : null}
                {facility.website ? (
                  <ContactRow
                    icon={Globe}
                    label={t('facility.website')}
                    value={facility.website}
                    onPress={() => openUrl(websiteUrl(facility.website as string))}
                  />
                ) : null}
              </View>
            </>
          ) : null}

          <Text className="mt-6 text-center text-[10px] leading-4 text-navy-muted">
            {t('facility.directoryNote')}
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}
