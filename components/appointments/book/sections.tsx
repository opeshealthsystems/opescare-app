/** The step bodies of the booking wizard (app/appointments/book.tsx). */
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
  Chip,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatDate,
  formatDateLong,
  formatTime,
} from '@/components/opes-ui';
import {
  CareButton,
  InfoRow,
  NoticeBanner,
  ProviderAvatar,
  SummaryLine,
  fmtDuration,
} from '@/components/care/shared';
import {
  appointmentReference,
  statusIconOf,
  statusLabelOf,
  statusToneOf,
  typeIconOf,
} from '@/components/care/apptLabels';
import { localDateKey, slotDurationMinutes, UNKNOWN_BOOKABILITY } from '@/lib/api/bookingQueries';
import {
  FACILITY_TYPES,
  FACILITY_TYPE_META,
  APPOINTMENT_TYPES,
  PERIOD_META,
  REASON_MAX_LENGTH,
  formatDayChip,
  formatMonth,
  formatFullDateTime,
  LinkAction,
  CardHead,
  FacilityCard,
  ProviderCard,
  EmptyCard,
  ChosenFacilityCard,
} from '@/components/appointments/book/helpers';
import type { BookingFlowModel } from './useBookingFlow';

export function FacilityStep({ vm }: { vm: BookingFlowModel }) {
  const { t, router, colors, styles, step, searchInput, setSearchInput, appliedSearch, setAppliedSearch, typeFilter, setTypeFilter, scope, setScope, hydratedFromLink, facilitiesQuery, facilities, totalFacilities, registry, onViewableItemsChanged, viewabilityConfig, bookabilityByFacility, facilityTypeLabel, handleSelectFacility } = vm;
  return (
    <>
      {/* ── Step 1 · Facility ─────────────────────────────────────────── */}
      {step === 'facility' && hydratedFromLink ? (
        <View style={styles.fill}>
          <View style={styles.gutter}>
            <PillInput
              icon={<Icon name="search" size={18} color={colors.blue} />}
              placeholder={t('appointments.book.searchPlaceholder')}
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmitEditing={() => setAppliedSearch(searchInput.trim())}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel={t('appointments.book.searchPlaceholder')}
            />

            {/* WHAT a facility can do, before WHAT KIND it is: a pharmacy that
                holds an open slot is a better answer to "book an appointment"
                than a hospital that holds none. Counts are the server's own. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipStrip}
              contentContainerStyle={styles.chipStripContent}
            >
              <Chip
                icon="calendar-check"
                label={t('discovery.scope.bookable', { defaultValue: 'Bookable' })}
                count={registry?.bookable_total}
                selected={scope === 'bookable'}
                onPress={() => setScope('bookable')}
                accessibilityHint={t('discovery.scope.bookableHint', {
                  defaultValue: 'Show only facilities with an appointment slot open right now',
                })}
              />
              <Chip
                icon="shield-check"
                label={t('facilityRegistry.connectedOnly', { defaultValue: 'Connected' })}
                count={registry?.connected_total}
                selected={scope === 'connected'}
                onPress={() => setScope('connected')}
                accessibilityHint={t('facilityRegistry.connectedOnlyHint', {
                  defaultValue:
                    'Show only facilities that can publish clinicians and take bookings',
                })}
              />
              <Chip
                icon="grid"
                label={t('facilityRegistry.allListings', { defaultValue: 'All listings' })}
                count={registry?.directory_total}
                selected={scope === 'all'}
                onPress={() => setScope('all')}
                accessibilityHint={t('facilityRegistry.allListingsHint', {
                  defaultValue: 'Show every facility in the public directory, connected or not',
                })}
              />
            </ScrollView>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              // A horizontal ScrollView in a column flex parent will happily grow
              // to eat the rest of the screen; pin it to its content height.
              style={styles.chipStrip}
              contentContainerStyle={styles.chipStripContent}
            >
              <Chip
                label={t('appointments.book.filterAll')}
                selected={typeFilter === ''}
                onPress={() => setTypeFilter('')}
              />
              {FACILITY_TYPES.map((value) => (
                <Chip
                  key={value}
                  label={t(`appointments.book.${FACILITY_TYPE_META[value].key}`)}
                  icon={FACILITY_TYPE_META[value].icon}
                  selected={typeFilter === value}
                  onPress={() => setTypeFilter(value)}
                />
              ))}
            </ScrollView>

            {/* Only a fraction of the directory is connected to scheduling; say
                so once, plainly, with the register's own numbers, instead of
                letting the patient discover it one dead end at a time. */}
            <View style={styles.block}>
              <NoticeBanner
                icon="info"
                tone={scope === 'bookable' && (registry?.bookable_total ?? 0) > 0 ? 'normal' : 'pending'}
                message={
                  registry
                    ? scope === 'bookable'
                      ? t('discovery.explainer.bookable', {
                          bookable: registry.bookable_total,
                          connected: registry.connected_total,
                          total: registry.directory_total,
                          defaultValue:
                            '{{bookable}} of {{total}} listed facilities have an appointment slot open right now. {{connected}} are connected to OpesCare; the rest of the directory can still be found and called.',
                        })
                      : scope === 'connected'
                        ? t('facilityRegistry.connectedExplainer', {
                            connected: registry.connected_total,
                            total: registry.directory_total,
                            defaultValue:
                              '{{connected}} of {{total}} listed facilities are connected to OpesCare. Only these can publish clinicians or take an online booking — the rest can still be found and called.',
                          })
                        : t('facilityRegistry.allExplainer', {
                            connected: registry.connected_total,
                            total: registry.directory_total,
                            defaultValue:
                              'Showing all {{total}} listed facilities. Only {{connected}} are connected to OpesCare; the others can be found and called, but publish no clinicians.',
                          })
                    : t('appointments.book.bookabilityNote')
                }
              />
            </View>
          </View>

          {facilitiesQuery.isPending ? (
            <View style={styles.centre}>
              <ActivityIndicator color={colors.blue} />
            </View>
          ) : facilitiesQuery.isError ? (
            <View style={styles.gutter}>
              <EmptyCard
                icon="alert-circle"
                tint="red"
                title={t('appointments.book.loadFacilitiesError')}
                message={t('appointments.book.loadFacilitiesErrorBody')}
              >
                <CareButton
                  label={t('appointments.book.retry')}
                  icon="refresh"
                  variant="secondary"
                  onPress={() => facilitiesQuery.refetch()}
                />
              </EmptyCard>
            </View>
          ) : (
            <FlatList
              data={facilities}
              keyExtractor={(item) => item.id}
              extraData={bookabilityByFacility}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              onEndReachedThreshold={0.4}
              onEndReached={() => {
                if (facilitiesQuery.hasNextPage && !facilitiesQuery.isFetchingNextPage) {
                  facilitiesQuery.fetchNextPage();
                }
              }}
              ListHeaderComponent={
                facilities.length > 0 ? (
                  <SectionHeader
                    variant="overline"
                    title={t('appointments.book.facilityCount', {
                      shown: facilities.length,
                      total: totalFacilities,
                    })}
                    actionLabel={appliedSearch ? t('appointments.book.clearSearch') : undefined}
                    onAction={
                      appliedSearch
                        ? () => {
                            setSearchInput('');
                            setAppliedSearch('');
                          }
                        : undefined
                    }
                  />
                ) : null
              }
              renderItem={({ item }) => (
                <FacilityCard
                  facility={item}
                  bookability={bookabilityByFacility.get(item.id) ?? UNKNOWN_BOOKABILITY}
                  typeLabel={facilityTypeLabel(item.facility_type)}
                  onPress={() => handleSelectFacility(item)}
                  onViewDetails={() => router.push(`/facility/${item.id}`)}
                />
              )}
              ListFooterComponent={
                facilitiesQuery.isFetchingNextPage ? (
                  <View style={styles.footerSpinner}>
                    <ActivityIndicator color={colors.blue} />
                  </View>
                ) : facilitiesQuery.hasNextPage ? (
                  <CareButton
                    label={t('appointments.book.loadMore')}
                    variant="secondary"
                    onPress={() => facilitiesQuery.fetchNextPage()}
                  />
                ) : null
              }
              ListEmptyComponent={
                /* An empty BOOKABLE list is almost never an empty directory —
                   it is the register saying nobody has opened a calendar. Say
                   that, and offer the wider slice as a deliberate choice; the
                   old copy read as a failed search and sent the patient back
                   to the search box that was never the problem. */
                scope === 'bookable' ? (
                  <EmptyCard
                    icon="calendar"
                    tint="amber"
                    title={t('discovery.empty.bookableTitle', {
                      defaultValue: 'No open appointment slots right now',
                    })}
                    message={
                      appliedSearch || typeFilter
                        ? t('discovery.empty.bookableFilteredBody', {
                            defaultValue:
                              'No facility matching those filters has an appointment slot open. Widen to the connected facilities — you can call them to arrange a visit — or clear the filters.',
                          })
                        : t('discovery.empty.bookableBody', {
                            connected: registry?.connected_total ?? 0,
                            defaultValue:
                              'No facility on OpesCare has an appointment slot open at the moment, so there is nothing to book online yet. {{connected}} facilities are connected and can be called directly.',
                          })
                    }
                  >
                    <CareButton
                      label={t('facilityRegistry.connectedOnly', { defaultValue: 'Connected' })}
                      icon="shield-check"
                      variant="secondary"
                      onPress={() => setScope('connected')}
                    />
                  </EmptyCard>
                ) : (
                  <EmptyCard
                    icon="search"
                    title={t('appointments.book.searchEmptyTitle')}
                    message={
                      scope === 'connected'
                        ? t('facilityRegistry.noConnectedMatch', {
                            defaultValue:
                              'No connected facility matches that search. The place you are looking for may still be in the public directory — show all listings to find and call it.',
                          })
                        : t('appointments.book.searchEmptyBody')
                    }
                  >
                    {scope === 'connected' ? (
                      <CareButton
                        label={t('facilityRegistry.allListings', { defaultValue: 'All listings' })}
                        icon="grid"
                        variant="secondary"
                        onPress={() => setScope('all')}
                      />
                    ) : appliedSearch || typeFilter ? (
                      <CareButton
                        label={t('appointments.book.clearFilters')}
                        icon="close"
                        variant="secondary"
                        onPress={() => {
                          setSearchInput('');
                          setAppliedSearch('');
                          setTypeFilter('');
                        }}
                      />
                    ) : null}
                  </EmptyCard>
                )
              }
            />
          )}
        </View>
      ) : null}
    </>
  );
}

export function DoctorStep({ vm }: { vm: BookingFlowModel }) {
  const { t, router, colors, styles, step, selectedFacility, providersQuery, providers, facilityIsUnlinked, facilityPhone, facilityTypeLabel, handleChangeFacility, handleSelectProvider, handleCallFacility } = vm;
  return (
    <>
      {/* ── Step 2 · Clinician ────────────────────────────────────────────
          Optional and always skippable. Picking "any available clinician"
          leaves selectedProviderId null and the slot list unfiltered. */}
      {step === 'doctor' && selectedFacility ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <ChosenFacilityCard
            facility={selectedFacility}
            typeLabel={facilityTypeLabel(selectedFacility.facility_type)}
            onViewFacility={() => router.push(`/facility/${selectedFacility.id}`)}
            onChangeFacility={handleChangeFacility}
          />

          {/* Embedded map — a real in-app OpenStreetMap view of the chosen
              facility with a locate-me/directions control that never leaves the
              app. */}
          {selectedFacility.latitude != null && selectedFacility.longitude != null ? (
            <View style={styles.block}>
              <FacilityMap facilities={selectedFacility} height={180} directions />
            </View>
          ) : null}

          {providersQuery.isPending ? (
            <View style={styles.centre}>
              <ActivityIndicator color={colors.blue} />
            </View>
          ) : facilityIsUnlinked ? (
            /* The directory listing has no linked operational facility, so it
               can never hold a slot. Say that, and give the patient the two
               things that still work. */
            <EmptyCard
              icon="calendar"
              tint="amber"
              title={t('appointments.book.unavailableTitle')}
              message={t('appointments.book.unavailableBody', {
                name: selectedFacility.facility_name,
              })}
            >
              {facilityPhone ? (
                <CareButton
                  label={t('appointments.book.callFacility')}
                  icon="phone"
                  variant="secondary"
                  onPress={handleCallFacility}
                />
              ) : null}
              <GradientButton
                label={t('appointments.book.chooseAnother')}
                icon="none"
                onPress={handleChangeFacility}
              />
            </EmptyCard>
          ) : (
            <>
              <View style={styles.sectionIntro}>
                <SectionHeader title={t('appointments.book.chooseDoctorPrompt')} />
                <Text style={styles.sectionHint}>{t('appointments.book.doctorStepSubtitle')}</Text>
              </View>

              {/* "Any available clinician" is always offered, even when the
                  roster is empty or failed to load — the flow must never
                  dead-end on a clinician list. */}
              <Card variant="flush" style={styles.listCard}>
                <ListRow
                  icon="users"
                  tint="purple"
                  title={t('appointments.book.anyDoctor')}
                  subtitle={t('appointments.book.anyDoctorHint')}
                  onPress={() => handleSelectProvider(null)}
                  accessibilityHint={t('appointments.book.seeTimes')}
                />
              </Card>

              {providersQuery.isError ? (
                <EmptyCard
                  icon="alert-circle"
                  tint="red"
                  title={t('appointments.book.loadDoctorsError')}
                  message={t('appointments.book.loadDoctorsErrorBody')}
                >
                  <CareButton
                    label={t('appointments.book.retry')}
                    icon="refresh"
                    variant="secondary"
                    onPress={() => providersQuery.refetch()}
                  />
                </EmptyCard>
              ) : providers.length === 0 ? (
                /* No published roster — the "any available clinician" card
                   directly above already IS the way forward, so this explains
                   the gap rather than repeating the same button under it. The
                   slot still carries a clinician; they are simply not listed
                   in the public directory yet. */
                <NoticeBanner
                  icon="stethoscope"
                  tone="pending"
                  title={t('appointments.book.noDoctors')}
                  message={t('appointments.book.noDoctorsBody')}
                />
              ) : (
                <>
                  <SectionHeader
                    variant="overline"
                    title={t('appointments.book.cliniciansHeading', { count: providers.length })}
                    style={styles.overline}
                  />
                  {providers.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      onSelect={() => handleSelectProvider(provider.id)}
                      onViewProfile={() => router.push(`/doctor/${provider.id}`)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      ) : null}
    </>
  );
}

export function SlotStep({ vm }: { vm: BookingFlowModel }) {
  const { t, locale, router, colors, styles, step, setStep, selectedFacility, selectedProviderId, setSelectedProviderId, days, selectedDate, setSelectedDate, selectedSlot, setSelectedSlot, slotsQuery, selectedProvider, facilityIsUnlinked, slotWindow, daySlots, slotGroups, daysWithSlots, nextSlotAhead, facilityHasSlotsOnDay, facilityPhone, facilityTypeLabel, handleChangeFacility, handleCallFacility } = vm;
  return (
    <>
      {/* ── Step 3 · Date & time ──────────────────────────────────────── */}
      {step === 'slot' && selectedFacility ? (
        <View style={styles.fill}>
          <ScrollView
            style={styles.fill}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <ChosenFacilityCard
              facility={selectedFacility}
              typeLabel={facilityTypeLabel(selectedFacility.facility_type)}
              onViewFacility={() => router.push(`/facility/${selectedFacility.id}`)}
              onChangeFacility={handleChangeFacility}
            >
              <View style={styles.cardLine}>
                <Icon name="stethoscope" size={16} color={colors.blue} />
                <Text style={styles.cardLineText} numberOfLines={1}>
                  {selectedProviderId
                    ? t('appointments.book.withDoctor', {
                        name: selectedProvider?.name ?? '…',
                      })
                    : t('appointments.book.anyDoctor')}
                </Text>
                <LinkAction
                  label={t('appointments.book.changeDoctor')}
                  onPress={() => setStep('doctor')}
                  chevron={false}
                />
              </View>
            </ChosenFacilityCard>

            <View style={styles.rowBetween}>
              <SectionHeader title={t('opesCare.slots.selectDate')} style={styles.rowHeader} />
              <Text style={styles.monthLabel}>
                {formatMonth(new Date(`${selectedDate}T12:00:00`), locale)}
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipStrip}
              contentContainerStyle={styles.dayStrip}
            >
              {days.map(({ date, key }, index) => {
                const { weekday, day } = formatDayChip(date, locale);
                const active = selectedDate === key;
                // A dot means "we have seen open slots on this day" — only the
                // window we actually fetched can say that, so absence of a dot
                // is silence, not a claim that the day is full.
                const known = daysWithSlots.has(key);
                const weekdayLabel = index === 0 ? t('appointments.book.today') : weekday;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => {
                      setSelectedDate(key);
                      setSelectedSlot(null);
                    }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={formatDateLong(date)}
                    style={[styles.dayChip, active ? styles.dayChipOn : styles.dayChipOff]}
                  >
                    <Text style={[styles.dayWeek, active && styles.dayTextOn]}>{weekdayLabel}</Text>
                    <Text style={[styles.dayDate, active && styles.dayTextOn]}>{day}</Text>
                    <View
                      style={[
                        styles.dayDot,
                        known && (active ? styles.dayDotOnActive : styles.dayDotOn),
                      ]}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <NoticeBanner icon="info" tone="pending" message={t('opesCare.slots.timezoneNote')} />

            <SectionHeader title={t('appointments.book.chooseSlotPrompt')} style={styles.slotsHeader} />

            {slotsQuery.isPending ? (
              <View style={styles.centre}>
                <ActivityIndicator color={colors.blue} />
              </View>
            ) : slotsQuery.isError ? (
              <EmptyCard
                icon="alert-circle"
                tint="red"
                title={t('appointments.book.loadSlotsError')}
                message={t('appointments.book.loadSlotsErrorBody')}
              >
                <CareButton
                  label={t('appointments.book.retry')}
                  icon="refresh"
                  variant="secondary"
                  onPress={() => slotsQuery.refetch()}
                />
              </EmptyCard>
            ) : facilityIsUnlinked ? (
              <EmptyCard
                icon="calendar"
                tint="amber"
                title={t('appointments.book.unavailableTitle')}
                message={t('appointments.book.unavailableBody', {
                  name: selectedFacility.facility_name,
                })}
              >
                {facilityPhone ? (
                  <CareButton
                    label={t('appointments.book.callFacility')}
                    icon="phone"
                    variant="secondary"
                    onPress={handleCallFacility}
                  />
                ) : null}
                <GradientButton
                  label={t('appointments.book.chooseAnother')}
                  icon="none"
                  onPress={handleChangeFacility}
                />
              </EmptyCard>
            ) : daySlots.length === 0 ? (
              <EmptyCard
                icon="clock"
                tint="amber"
                title={
                  selectedProviderId && facilityHasSlotsOnDay
                    ? t('appointments.book.noSlotsForDoctorTitle')
                    : slotWindow.length === 0
                      ? t('appointments.book.noSlotsAheadTitle')
                      : t('appointments.book.noSlotsTitle')
                }
                message={
                  selectedProviderId && facilityHasSlotsOnDay
                    ? t('appointments.book.noSlotsForDoctorBody')
                    : slotWindow.length === 0
                      ? t('appointments.book.noSlotsAheadBody')
                      : t('appointments.book.noSlotsBody')
                }
              >
                {nextSlotAhead ? (
                  <CareButton
                    label={t('appointments.book.jumpToNext', {
                      when: formatDate(nextSlotAhead.starts_at),
                    })}
                    icon="calendar-check"
                    variant="secondary"
                    onPress={() => {
                      setSelectedDate(localDateKey(nextSlotAhead.starts_at));
                      setSelectedSlot(null);
                    }}
                  />
                ) : null}
                {selectedProviderId && facilityHasSlotsOnDay ? (
                  <CareButton
                    label={t('appointments.book.chooseAnyDoctor')}
                    icon="users"
                    variant="secondary"
                    onPress={() => {
                      setSelectedProviderId(null);
                      setSelectedSlot(null);
                    }}
                  />
                ) : null}
                {selectedDate !== days[0].key ? (
                  <CareButton
                    label={t('appointments.book.backToToday')}
                    icon="calendar"
                    variant="secondary"
                    onPress={() => {
                      setSelectedDate(days[0].key);
                      setSelectedSlot(null);
                    }}
                  />
                ) : null}
              </EmptyCard>
            ) : (
              <View style={styles.buckets}>
                {slotGroups.map((group) => (
                  <View key={group.period}>
                    <View style={styles.bucketHead}>
                      <Icon
                        name={PERIOD_META[group.period].icon}
                        size={18}
                        color={colors.statusWarning}
                      />
                      <Text style={styles.bucketLabel}>
                        {t(`opesCare.slots.${PERIOD_META[group.period].key}`)}
                      </Text>
                      <View style={styles.bucketRule} />
                      <Text style={styles.bucketCount}>
                        {t('appointments.book.slotsOpen', { count: group.slots.length })}
                      </Text>
                    </View>
                    <View style={styles.slotGrid}>
                      {group.slots.map((slot) => {
                        const active = selectedSlot?.id === slot.id;
                        const scarce = slot.available_count <= 1;
                        const start = formatTime(slot.starts_at);
                        const end = formatTime(slot.ends_at);
                        // Seeded capacity is 3, so "3 places left" on every
                        // chip would be pure noise. Show the plain start time
                        // by default and add the remaining-places warning only
                        // when it is genuinely running out.
                        return (
                          <Chip
                            key={slot.id}
                            label={
                              scarce
                                ? `${start} · ${t('appointments.book.spotsLeft', {
                                    count: slot.available_count,
                                  })}`
                                : start
                            }
                            icon={scarce ? 'alert-circle' : undefined}
                            selected={active}
                            onPress={() => setSelectedSlot(slot)}
                            accessibilityLabel={`${start} – ${end}`}
                            accessibilityHint={
                              scarce
                                ? t('appointments.book.spotsLeft', { count: slot.available_count })
                                : undefined
                            }
                            style={styles.slotChip}
                          />
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {daySlots.length > 0 ? (
            <View style={styles.stickyFooter}>
              <Card style={styles.footerCard}>
                <View style={styles.footerRow}>
                  <View style={styles.footerIcon}>
                    <Icon name="calendar-check" size={26} color={colors.blue} />
                  </View>
                  <View style={styles.footerBody}>
                    <Text style={styles.footerTitle} numberOfLines={1}>
                      {t('opesCare.slots.selectedDate', {
                        date: formatDateLong(`${selectedDate}T12:00:00`),
                      })}
                    </Text>
                    <Text style={styles.footerText} numberOfLines={1}>
                      {selectedSlot
                        ? t('opesCare.slots.selectedSlot', {
                            time: formatTime(selectedSlot.starts_at),
                            minutes: slotDurationMinutes(selectedSlot) ?? '—',
                          })
                        : t('opesCare.slots.selectPrompt')}
                    </Text>
                  </View>
                </View>
              </Card>
              <GradientButton
                label={t('opesCare.slots.continue')}
                onPress={() => setStep('confirm')}
                disabled={!selectedSlot}
                accessibilityHint={t('appointments.book.stepConfirm')}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

export function ConfirmStep({ vm }: { vm: BookingFlowModel }) {
  const { t, patient, colors, styles, step, selectedFacility, selectedProviderId, selectedSlot, appointmentType, setAppointmentType, reason, setReason, bookMutation, selectedProvider, appointmentTypeLabel, handleConfirmBooking, handlePickAnotherTime, bookedDuration, bookingErrorKeyNow, facilityAddress } = vm;
  return (
    <>
      {/* ── Step 4 · Confirm ──────────────────────────────────────────── */}
      {step === 'confirm' && selectedFacility && selectedSlot ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.almost}>
            <View style={styles.almostIcon}>
              <Icon name="check" size={24} color={colors.statusNormal} />
            </View>
            <View style={styles.almostBody}>
              <Text style={styles.almostTitle}>{t('opesCare.review.almostTitle')}</Text>
              <Text style={styles.almostText}>{t('opesCare.review.almostText')}</Text>
            </View>
          </View>

          <Card>
            <CardHead
              icon="clipboard"
              title={t('appointments.book.typeLabel')}
              hint={t('appointments.book.typeHint')}
            />
            <View style={styles.typeChips}>
              {APPOINTMENT_TYPES.map((type) => (
                <Chip
                  key={type.value}
                  label={t(`appointments.book.${type.key}`)}
                  icon={typeIconOf(type.value)}
                  selected={appointmentType === type.value}
                  onPress={() => setAppointmentType(type.value)}
                />
              ))}
            </View>
          </Card>

          {/* Reason is a free-text note the facility reads before the visit;
              the API accepts up to 1000 characters, so give it real room and
              show the budget rather than truncating silently. */}
          <Card>
            <CardHead
              icon="edit"
              title={t('appointments.book.reasonLabel')}
              hint={t('appointments.book.reasonHint')}
            />
            <TextInput
              style={styles.textarea}
              placeholder={t('appointments.book.reasonPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={REASON_MAX_LENGTH}
              textAlignVertical="top"
              accessibilityLabel={t('appointments.book.reasonLabel')}
            />
            <Text style={styles.counter}>
              {t('appointments.book.reasonCounter', {
                used: reason.length,
                max: REASON_MAX_LENGTH,
              })}
            </Text>
          </Card>

          <View>
            <SectionHeader title={t('appointments.book.reviewTitle')} />
            <Card variant="flush">
              <View style={styles.rows}>
                <InfoRow
                  icon="building"
                  label={t('appointments.book.reviewFacility')}
                  value={
                    facilityAddress(selectedFacility)
                      ? `${selectedFacility.facility_name} · ${facilityAddress(selectedFacility)}`
                      : selectedFacility.facility_name
                  }
                  divider
                />
                <InfoRow
                  icon="stethoscope"
                  tint="purple"
                  label={t('appointments.book.reviewDoctor')}
                  value={
                    selectedProviderId
                      ? [selectedProvider?.name ?? '—', selectedProvider?.job_title]
                          .filter(Boolean)
                          .join(' · ')
                      : t('appointments.book.anyDoctor')
                  }
                  divider
                />
                <InfoRow
                  icon="calendar"
                  label={t('appointments.book.reviewDateTime')}
                  value={
                    bookedDuration
                      ? `${formatFullDateTime(selectedSlot.starts_at)} (${fmtDuration(bookedDuration)})`
                      : formatFullDateTime(selectedSlot.starts_at)
                  }
                  divider
                />
                <InfoRow
                  icon={typeIconOf(appointmentType)}
                  tint="green"
                  label={t('appointments.book.reviewType')}
                  value={appointmentTypeLabel(appointmentType)}
                  divider={!!patient}
                />
                {patient ? (
                  <InfoRow
                    icon="id-card"
                    label={t('appointments.book.reviewPatient')}
                    value={patient.display_name}
                  />
                ) : null}
              </View>
              <View style={styles.summary}>
                <SummaryLine
                  label={t('opesCare.review.reasonTitle')}
                  value={reason.trim() || t('appointments.book.noReasonGiven')}
                />
                {patient ? (
                  <SummaryLine label={t('appointments.book.healthId')} value={patient.health_id} strong />
                ) : null}
              </View>
            </Card>
          </View>

          <NoticeBanner icon="info" tone="pending" message={t('appointments.book.confirmNote')} />

          {bookingErrorKeyNow ? (
            <View style={styles.errorWrap}>
              <NoticeBanner
                icon="alert-circle"
                tone="critical"
                title={t(`appointments.book.${bookingErrorKeyNow}`)}
                message={
                  bookingErrorKeyNow === 'bookErrorSlotTaken'
                    ? t('opesCare.review.conflictMessage')
                    : t('opesCare.review.checkHint')
                }
              />
              {bookingErrorKeyNow === 'bookErrorSlotTaken' ? (
                <CareButton
                  label={t('appointments.book.pickAnotherTime')}
                  icon="clock"
                  variant="secondary"
                  onPress={handlePickAnotherTime}
                />
              ) : null}
            </View>
          ) : null}

          <GradientButton
            label={
              bookMutation.isPending
                ? t('appointments.book.booking')
                : t('appointments.book.confirmButton')
            }
            onPress={handleConfirmBooking}
            loading={bookMutation.isPending}
            icon="none"
            accessibilityHint={t('appointments.book.confirmNote')}
          />
        </ScrollView>
      ) : null}
    </>
  );
}

export function SuccessStep({ vm }: { vm: BookingFlowModel }) {
  const { t, router, patient, colors, styles, tt, step, selectedFacility, selectedSlot, bookedAppointment, selectedProvider, facilityPhone, appointmentTypeLabel, handleCallFacility, handleShareAppointment, bookedDuration, facilityAddress } = vm;
  return (
    <>
      {/* ── Success ───────────────────────────────────────────────────── */}
      {step === 'success' && bookedAppointment ? (
        <>
          <ScreenHeader title={t('opesCare.confirmed.title')} align="center" showBack={false} />
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero} accessibilityLiveRegion="polite">
              <View style={styles.heroMark}>
                <Icon name="check" size={40} color={colors.statusNormal} />
              </View>
              <Text style={styles.heroTitle} accessibilityRole="header">
                {t('opesCare.confirmed.heroTitle')}
              </Text>
              <Text style={styles.heroText}>{t('appointments.book.confirmedBody')}</Text>
            </View>

            <Card variant="flush">
              <View style={styles.detailsHead}>
                <Icon name="calendar" size={22} color={colors.blue} />
                <Text style={styles.detailsTitle} accessibilityRole="header">
                  {t('opesCare.confirmed.detailsTitle')}
                </Text>
                {/* The status the API actually assigned — `booked` until the
                    facility acknowledges it — never an assumed "confirmed". */}
                <StatusBadge
                  status={bookedAppointment.status}
                  tone={statusToneOf(bookedAppointment.status)}
                  icon={statusIconOf(bookedAppointment.status)}
                  size="sm"
                  label={statusLabelOf(tt, bookedAppointment.status)}
                />
              </View>

              <View style={styles.summary}>
                <SummaryLine
                  label={t('appointments.book.bookingIdLabel')}
                  value={appointmentReference(bookedAppointment.id)}
                  strong
                />
              </View>

              {/* "Any available clinician" still books a real person — the API
                  copies the locked slot's provider onto the appointment — so
                  name them here even though the patient never picked them. */}
              <View style={styles.providerRow}>
                <ProviderAvatar
                  name={
                    selectedProvider?.name ??
                    bookedAppointment.provider_name ??
                    t('opesCare.appt.careTeam')
                  }
                  size={64}
                />
                <View style={styles.providerBody}>
                  <Text style={styles.providerLabel}>{t('opesCare.confirmed.providerLabel')}</Text>
                  <Text style={styles.providerName} numberOfLines={2}>
                    {selectedProvider?.name ??
                      bookedAppointment.provider_name ??
                      t('opesCare.appt.providerTbd')}
                  </Text>
                  {!!selectedProvider?.job_title && (
                    <Text style={styles.providerSpecialty}>{selectedProvider.job_title}</Text>
                  )}
                  <View style={styles.metaRow}>
                    <Icon name="building" size={15} color={colors.textSecondary} />
                    <Text style={styles.meta} numberOfLines={1}>
                      {bookedAppointment.facility_name ??
                        selectedFacility?.facility_name ??
                        t('opesCare.appt.facilityTbd')}
                    </Text>
                  </View>
                  {selectedFacility && facilityAddress(selectedFacility) ? (
                    <View style={styles.metaRow}>
                      <Icon name="location" size={15} color={colors.textSecondary} />
                      <Text style={styles.meta} numberOfLines={1}>
                        {facilityAddress(selectedFacility)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              {selectedProvider ? (
                <View style={styles.cardFoot}>
                  <LinkAction
                    label={t('appointments.book.viewDoctorProfile')}
                    onPress={() => router.push(`/doctor/${selectedProvider.id}`)}
                  />
                </View>
              ) : null}

              <View style={styles.rows}>
                <InfoRow
                  icon="calendar"
                  label={t('opesCare.confirmed.labelDate')}
                  value={
                    bookedAppointment.scheduled_at ? formatDateLong(bookedAppointment.scheduled_at) : '—'
                  }
                  divider
                />
                <InfoRow
                  icon="clock"
                  label={t('opesCare.confirmed.labelTime')}
                  value={
                    bookedAppointment.scheduled_at
                      ? selectedSlot
                        ? `${formatTime(bookedAppointment.scheduled_at)} – ${formatTime(selectedSlot.ends_at)}${
                            bookedDuration ? ` (${fmtDuration(bookedDuration)})` : ''
                          }`
                        : formatTime(bookedAppointment.scheduled_at)
                      : '—'
                  }
                  divider
                />
                <InfoRow
                  icon={typeIconOf(bookedAppointment.appointment_type)}
                  tint="green"
                  label={t('opesCare.confirmed.labelType')}
                  value={appointmentTypeLabel(bookedAppointment.appointment_type)}
                  divider
                />
                <InfoRow
                  icon="edit"
                  label={t('opesCare.confirmed.labelReason')}
                  value={bookedAppointment.reason ?? t('opesCare.appt.notSpecified')}
                  divider={!!patient}
                />
                {patient ? (
                  <InfoRow
                    icon="id-card"
                    label={t('appointments.book.reviewPatient')}
                    value={`${patient.display_name} · ${t('appointments.book.healthId')} ${patient.health_id}`}
                  />
                ) : null}
              </View>
            </Card>

            <NoticeBanner
              icon="info"
              tone="pending"
              title={t('appointments.book.whatToExpectTitle')}
              message={`${t('appointments.book.whatToExpectArrive')}\n${t('appointments.book.whatToExpectBring')}`}
            />

            <Card variant="flush">
              <View style={styles.detailsHead}>
                <Text style={styles.detailsTitle} accessibilityRole="header">
                  {t('opesCare.confirmed.nextTitle')}
                </Text>
              </View>
              <ListRow
                icon="share"
                tint="blue"
                title={t('opesCare.confirmed.shareTitle')}
                onPress={handleShareAppointment}
                divider
              />
              <ListRow
                icon="document-text"
                tint="blue"
                title={t('opesCare.confirmed.viewDetailsTitle')}
                subtitle={t('opesCare.confirmed.viewDetailsSub')}
                onPress={() => router.replace(`/appointments/${bookedAppointment.id}`)}
                divider
              />
              <ListRow
                icon="calendar"
                tint="purple"
                title={t('opesCare.confirmed.seeAllTitle')}
                onPress={() => router.replace('/appointments')}
                divider={!!facilityPhone}
              />
              {facilityPhone ? (
                <ListRow
                  icon="phone"
                  tint="green"
                  title={t('appointments.book.callFacility')}
                  subtitle={facilityPhone}
                  onPress={handleCallFacility}
                />
              ) : null}
            </Card>

            <View style={styles.ctaStack}>
              <GradientButton
                label={t('appointments.book.viewAppointment')}
                onPress={() => router.replace(`/appointments/${bookedAppointment.id}`)}
              />
              <CareButton
                label={t('opesCare.confirmed.goHome')}
                icon="home"
                variant="secondary"
                onPress={() => router.replace('/(tabs)/home')}
              />
            </View>
          </ScrollView>
        </>
      ) : null}
    </>
  );
}
