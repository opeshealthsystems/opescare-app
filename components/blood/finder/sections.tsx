/** Large JSX sections of the Blood Finder screen (app/blood-finder.tsx). */
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  PillInput,
  ResultList,
  SectionHeader,
  StaleNotice,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import {
  CITIES,
  RADIUS_OPTIONS,
  LOCAL_RESULT_LIMIT,
  COMPONENT_ICONS,
  BLOOD_TINT,
  dial,
  URGENCY_OPTIONS,
  TRUST_POINTS,
} from '@/components/blood/finder/helpers';
import {
  FieldLabel,
  FieldSelect,
  OptionCard,
  BloodBankCard,
  NoStockPanel,
  OpenRequestCard,
} from '@/components/blood/finder/parts';
import type { BloodFinderModel } from './useBloodFinder';

export function FinderCard({ vm }: { vm: BloodFinderModel }) {
  // Below 380dp the side-by-side fields and icon+label urgency chips were cut
  // to "Compone…", "Wh ole…" and "Emerge…"; stack the fields, drop the chip icons.
  const narrow = useWindowDimensions().width < 380;
  const { t, colors, styles, bloodGroup, setBloodGroup, componentType, setComponentType, city, setCity, deviceCoords, setDeviceCoords, locating, locationDenied, radiusKm, setRadiusKm, urgency, setUrgency, sheet, setSheet, scrollRef, resultsY, originLabel, options, groupOptions, selectedComponentLabel, visibleGroups, componentChoices, handleUseMyLocation } = vm;
  return (
    <>
      {/* The finder card, as PM-BLOOD-01 draws it: two columns for
          1|2 and 4|5, urgency across the middle, and four different
          controls because each field is a different kind of choice. */}
      <Card>
        <View style={styles.finderStack}>
          {/* ── 1 | 2 ────────────────────────────────────────────────── */}
          <View style={[styles.fieldRow, narrow && styles.fieldRowStacked]}>
            <View style={[styles.fieldWide, narrow && styles.fieldFull]}>
              <FieldLabel index={1} label={t('bloodFinder.stepGroup')} />
              {options.isPending ? (
                <LoadingBlock label={t('bloodFinder.searching')} />
              ) : options.isError ? (
                <EmptyState
                  icon="alert-circle"
                  tint="red"
                  title={t('bloodFinder.loadFailed')}
                  actionLabel={t('bloodFinder.retry')}
                  onAction={() => options.refetch()}
                />
              ) : (
                <View style={styles.groupRow}>
                  {/* Four in the row, as drawn, and the rest behind More —
                      the patient's own group is always one of the four so
                      the commonest choice is never hidden. */}
                  {visibleGroups.map((group) => (
                    <TouchableOpacity
                      key={group.value}
                      onPress={() =>
                        setBloodGroup(group.value === bloodGroup ? null : group.value)
                      }
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: group.value === bloodGroup }}
                      style={[
                        styles.groupPill,
                        {
                          borderColor:
                            group.value === bloodGroup ? colors.blue : colors.border,
                          backgroundColor:
                            group.value === bloodGroup ? colors.blue : colors.surface,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.groupPillText,
                          {
                            color:
                              group.value === bloodGroup ? '#FFFFFF' : colors.textPrimary,
                          },
                        ]}
                      >
                        {group.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => setSheet((c) => (c === 'group' ? null : 'group'))}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('bloodFinder.moreGroups')}
                    style={[styles.groupPill, styles.groupMore, { borderColor: colors.border }]}
                  >
                    <Icon name="grid" size={15} color={colors.textSecondary} />
                    <Text style={styles.groupMoreText}>{t('bloodFinder.more')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={[styles.fieldNarrow, narrow && styles.fieldFull]}>
              <FieldLabel index={2} label={t('bloodFinder.stepComponent')} />
              <FieldSelect
                icon="droplet"
                value={selectedComponentLabel}
                open={sheet === 'component'}
                onPress={() => setSheet((c) => (c === 'component' ? null : 'component'))}
                accessibilityLabel={t('bloodFinder.stepComponent')}
              />
            </View>
          </View>

          {sheet === 'group' ? (
            <OptionCard title={t('bloodFinder.stepGroup')}>
              {groupOptions.map((group, index) => (
                <ListRow
                  key={group.value}
                  title={group.label}
                  meta={[
                    group.facility_count > 0
                      ? t('bloodFinder.facilityCount', { count: group.facility_count })
                      : t('bloodFinder.noSites'),
                  ]}
                  trailing={
                    group.value === bloodGroup ? (
                      <Icon name="check" size={18} color={colors.blue} />
                    ) : undefined
                  }
                  chevron={false}
                  divider={index < groupOptions.length - 1}
                  onPress={() => {
                    setBloodGroup(group.value);
                    setSheet(null);
                  }}
                />
              ))}
            </OptionCard>
          ) : null}

          {sheet === 'component' ? (
            <OptionCard title={t('bloodFinder.stepComponent')}>
              {componentChoices.map((choice, index) => (
                <ListRow
                  key={choice.value}
                  icon={COMPONENT_ICONS[choice.icon] ?? 'droplet'}
                  tint={BLOOD_TINT}
                  title={t(`bloodFinder.components.${choice.value}`)}
                  meta={[
                    choice.count > 0
                      ? t('bloodFinder.facilityCount', { count: choice.count })
                      : t('bloodFinder.noSites'),
                  ]}
                  trailing={
                    choice.value === componentType ? (
                      <Icon name="check" size={18} color={colors.blue} />
                    ) : undefined
                  }
                  chevron={false}
                  divider={index < componentChoices.length - 1}
                  onPress={() => {
                    setComponentType(choice.value);
                    setSheet(null);
                  }}
                />
              ))}
            </OptionCard>
          ) : null}

          {/* ── 3 ────────────────────────────────────────────────────── */}
          <View>
            <FieldLabel index={3} label={t('bloodFinder.stepUrgency')} />
            <View style={styles.urgencyRow}>
              {URGENCY_OPTIONS.map((option) => {
                const active = option.value === urgency;
                const tone =
                  option.value === 'emergency'
                    ? colors.statusCritical
                    : option.value === 'urgent'
                      ? colors.statusWarning
                      : colors.blue;
                const toneBg =
                  option.value === 'emergency'
                    ? colors.statusCriticalBg
                    : option.value === 'urgent'
                      ? colors.statusWarningBg
                      : colors.tintBlueBg;

                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setUrgency(option.value)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.urgencyButton,
                      {
                        borderColor: active ? tone : colors.border,
                        backgroundColor: active ? toneBg : colors.surface,
                      },
                    ]}
                  >
                    {narrow ? null : <Icon
                      name={option.icon}
                      size={16}
                      color={active ? tone : colors.textSecondary}
                    />}
                    <Text
                      style={[
                        styles.urgencyText,
                        { color: active ? tone : colors.textPrimary },
                      ]}
                      numberOfLines={2}
                    >
                      {t(`bloodFinder.urgency.${option.value}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── 4 | 5 ────────────────────────────────────────────────── */}
          <View style={[styles.fieldRow, narrow && styles.fieldRowStacked]}>
            <View style={[styles.fieldWide, narrow && styles.fieldFull]}>
              <FieldLabel index={4} label={t('bloodFinder.stepWhere')} />
              <View style={[styles.locationField, { borderColor: colors.border }]}>
                <Icon name="location" size={17} color={colors.textSecondary} />
                <Text style={styles.locationText} numberOfLines={1}>
                  {originLabel}
                </Text>
                {/* The reference's crosshair: one tap for a real GPS fix. */}
                <TouchableOpacity
                  onPress={() => {
                    void handleUseMyLocation();
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('bloodFinder.useMyLocation')}
                  style={styles.locateButton}
                >
                  <Icon
                    name="target"
                    size={18}
                    color={locating ? colors.textMuted : colors.blue}
                  />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => setSheet((c) => (c === 'city' ? null : 'city'))}
                accessibilityRole="button"
                style={styles.changeCity}
              >
                <Text style={[styles.changeCityText, { color: colors.blue }]}>
                  {t('bloodFinder.changeLocation')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.fieldNarrow, narrow && styles.fieldFull]}>
              <FieldLabel index={5} label={t('bloodFinder.stepRange')} />
              <FieldSelect
                value={t('bloodFinder.radius', { km: radiusKm })}
                open={sheet === 'radius'}
                onPress={() => setSheet((c) => (c === 'radius' ? null : 'radius'))}
                accessibilityLabel={t('bloodFinder.stepRange')}
              />
            </View>
          </View>

          {sheet === 'city' ? (
            <OptionCard title={t('bloodFinder.changeLocation')}>
              {CITIES.map((option, index) => (
                <ListRow
                  key={option.key}
                  title={option.name}
                  trailing={
                    !deviceCoords && option.key === city.key ? (
                      <Icon name="check" size={18} color={colors.blue} />
                    ) : undefined
                  }
                  chevron={false}
                  divider={index < CITIES.length - 1}
                  onPress={() => {
                    setCity(option);
                    setDeviceCoords(null);
                    setSheet(null);
                  }}
                />
              ))}
            </OptionCard>
          ) : null}

          {sheet === 'radius' ? (
            <OptionCard title={t('bloodFinder.stepRange')}>
              {RADIUS_OPTIONS.map((option, index) => (
                <ListRow
                  key={option}
                  title={t('bloodFinder.radius', { km: option })}
                  trailing={
                    option === radiusKm ? (
                      <Icon name="check" size={18} color={colors.blue} />
                    ) : undefined
                  }
                  chevron={false}
                  divider={index < RADIUS_OPTIONS.length - 1}
                  onPress={() => {
                    setRadiusKm(option);
                    setSheet(null);
                  }}
                />
              ))}
            </OptionCard>
          ) : null}

          {locationDenied ? (
            <NoticeBanner
              icon="location"
              tone="warning"
              message={t('bloodFinder.locationDenied')}
            />
          ) : null}
        </View>

        {/* The reference's primary action: search glyph, centred label, and
            a chevron. It scrolls to the results, which are already live —
            a button that claimed to start a search that was never stopped
            would be the one lie this screen cannot afford. */}
        <TouchableOpacity
          onPress={() => {
            scrollRef.current?.scrollTo({
              y: Math.max(resultsY.current - 12, 0),
              animated: true,
            });
          }}
          disabled={!bloodGroup}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('bloodFinder.findBlood')}
          style={[
            styles.findButton,
            { backgroundColor: bloodGroup ? colors.blue : colors.border },
          ]}
        >
          <Icon name="search" size={19} color="#FFFFFF" />
          <Text style={styles.findButtonText}>{t('bloodFinder.findBlood')}</Text>
          <Icon name="chevron-right" size={19} color="#FFFFFF" />
        </TouchableOpacity>
      </Card>
    </>
  );
}

export function TrustAndEmergency({ vm }: { vm: BloodFinderModel }) {
  const { t, router, colors, styles } = vm;
  return (
    <>
      {/* Trust strip ----------------------------------------------------
          Four assurances, each one a claim this platform can stand behind:
          screening and verification are facility attributes the directory
          carries, the freshness stamp is on every stock row, and privacy is
          the Health ID consent model. Deliberately no figures. */}
      <Card variant="flush">
        <View style={styles.trustRow}>
          {TRUST_POINTS.map((point, index) => (
            <View
              key={point.key}
              style={[
                styles.trustItem,
                index < TRUST_POINTS.length - 1 && {
                  borderRightWidth: StyleSheet.hairlineWidth,
                  borderRightColor: colors.border,
                },
              ]}
            >
              <Icon name={point.icon} size={19} color={colors.blue} />
              <Text style={styles.trustText}>{t(`bloodFinder.trust.${point.key}`)}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Escalation. Blood stock here is self-reported and may be hours old;
          a patient who is actually in danger should be moving toward a
          hospital, not filtering a list. No hotline number is hardcoded -
          none exists in this codebase and inventing one would be dangerous -
          so both actions lead to screens that surface real, API-sourced
          numbers. */}
      <Card accentColor={colors.statusCritical}>
        <View style={styles.emergencyHead}>
          <View style={[styles.emergencyMark, { backgroundColor: colors.statusCriticalBg }]}>
            <Icon name="alert-triangle" size={20} color={colors.statusCritical} />
          </View>
          <View style={styles.emergencyBody}>
            <Text style={[styles.emergencyTitle, { color: colors.statusCritical }]}>
              {t('bloodFinder.emergencyTitle')}
            </Text>
            <Text style={styles.emergencyText}>{t('bloodFinder.emergencyBody')}</Text>
          </View>
        </View>
        <View style={styles.actionRow}>
          <CareButton
            label={t('bloodFinder.emergencyFindEr')}
            icon="first-aid"
            variant="dangerSolid"
            size="sm"
            onPress={() => router.push('/care-map')}
            style={styles.actionButton}
          />
          <CareButton
            label={t('bloodFinder.emergencySupport')}
            icon="phone"
            variant="danger"
            size="sm"
            onPress={() => router.push('/help')}
            style={styles.actionButton}
          />
        </View>
      </Card>
    </>
  );
}

export function ResultsSection({ vm }: { vm: BloodFinderModel }) {
  const { t, router, colors, styles, bloodGroup, setBloodGroup, componentType, setComponentType, radiusKm, setRadiusKm, term, setTerm, debouncedTerm, nationwideOpen, setNationwideOpen, nationwideExpanded, setNationwideExpanded, originLabel, search, nationwide, selectedGroup, selectedComponentLabel, compatibleGroups, rows, results, nationwideRows, mappable, componentMatrix, nextRadius, truncated, searchStale, goToRequest, goToBank, onResultsLayout } = vm;
  return (
    <>
      {/* ── Results ──────────────────────────────────────────────────────── */}
      <View
        onLayout={onResultsLayout}
      />
      {!bloodGroup ? (
        <Card variant="flush">
          <EmptyState
            icon="droplet"
            tint={BLOOD_TINT}
            title={t('bloodFinder.chooseGroupTitle')}
            message={t('bloodFinder.chooseGroupBody')}
          />
        </Card>
      ) : (
        <View style={styles.stack}>
          <View>
            <SectionHeader
              title={
                search.isPending
                  ? t('bloodFinder.searching')
                  : t('bloodFinder.nearbyBanks', { count: results.length })
              }
              actionLabel={t('bloodFinder.viewOnMap')}
              onAction={() => router.push('/blood-finder/map')}
            />
            <Text style={styles.sectionHint}>
              {[
                `${bloodGroup}  •  ${selectedComponentLabel}`,
                t('bloodFinder.radius', { km: radiusKm }),
                originLabel,
                t('bloodFinder.sortByDistance'),
              ].join('  ·  ')}
            </Text>
          </View>

          {searchStale ? (
            <StaleNotice
              message={t('bloodFinder.loadFailed')}
              loadedAt={search.dataUpdatedAt ? new Date(search.dataUpdatedAt) : null}
              onRetry={() => search.refetch()}
              retrying={search.isFetching}
            />
          ) : null}

          {/* A filter box only earns its space once there is a list to filter. */}
          {rows.length > 3 || debouncedTerm ? (
            <View style={styles.searchWrap}>
              <PillInput
                icon={<Icon name="search" size={18} color={colors.blue} />}
                value={term}
                onChangeText={setTerm}
                placeholder={t('bloodFinder.filterResults')}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                accessibilityLabel={t('bloodFinder.filterPlaceholder')}
              />
              {term.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setTerm('')}
                  hitSlop={10}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('bloodFinder.clear')}
                  style={styles.searchClear}
                >
                  <Icon name="x-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {search.isPending ? (
            <LoadingBlock label={t('bloodFinder.searching')} />
          ) : search.isError && rows.length === 0 ? (
            <Card variant="flush">
              <EmptyState
                icon="alert-circle"
                tint="red"
                title={t('bloodFinder.loadFailed')}
                message={t('bloodFinder.searchFailedHint', {
                  defaultValue:
                    'Nothing was returned, so nothing on this screen is out of date — it is simply unknown. Check your connection and try again.',
                })}
                actionLabel={t('bloodFinder.retry')}
                onAction={() => search.refetch()}
              />
            </Card>
          ) : results.length === 0 ? (
            <NoStockPanel
              radiusKm={radiusKm}
              nextRadius={nextRadius}
              onWiden={() => {
                if (nextRadius) setRadiusKm(nextRadius);
              }}
              // "The filter hid everything" is only the explanation when
              // there was in fact something to hide.
              filtered={!!debouncedTerm && rows.length > 0}
              onClearFilter={() => setTerm('')}
              componentLabel={selectedComponentLabel}
              onWholeBlood={
                componentType === 'whole_blood' ? null : () => setComponentType('whole_blood')
              }
              group={selectedGroup?.label ?? bloodGroup}
              compatibleGroups={compatibleGroups}
              onPickGroup={setBloodGroup}
              nationwideOpen={nationwideOpen}
              onNationwide={() => setNationwideOpen(true)}
              nationwidePending={nationwide.isPending}
              nationwideError={nationwide.isError}
              nationwideRows={nationwideRows}
              nationwideExpanded={nationwideExpanded}
              onToggleNationwide={() => setNationwideExpanded((open) => !open)}
              onRetryNationwide={() => nationwide.refetch()}
              onFindHospital={() => router.push('/care-map')}
              onOpenFacility={goToRequest}
            />
          ) : (
            <View style={styles.stack}>
              {/* Real embedded map of the blood banks, in-app (no external maps
                  app). Only shown when at least one result has coordinates. */}
              {mappable.length > 0 ? (
                <Card variant="flush">
                  <FacilityMap facilities={mappable} height={240} />
                </Card>
              ) : null}
              {/* Six blood banks are six things to compare and pick between.
                  `BloodBankCard` already draws its own flush card, so it goes
                  straight into the list; the gap does the separating. */}
              <ResultList>
                {results.map((facility) => (
                  <BloodBankCard
                    key={facility.id}
                    facility={facility}
                    components={componentMatrix.forFacility(facility.id)}
                    onOpen={() => goToBank(facility)}
                    onCall={() => dial(facility.phone ?? facility.emergency_contact)}
                  />
                ))}
              </ResultList>
              {truncated ? (
                <NoticeBanner
                  icon="info"
                  tone="pending"
                  // `limit`, not `count`: an interpolation named `count` makes
                  // i18next look for plural forms of a key that does not exist
                  // yet, and the defaultValue is the only copy there is.
                  message={t('bloodFinder.resultsTruncated', {
                    limit: LOCAL_RESULT_LIMIT,
                    defaultValue:
                      'Only the {{limit}} nearest facilities are listed. Narrow the radius to be sure you are seeing the closest ones.',
                  })}
                />
              ) : null}
            </View>
          )}
        </View>
      )}
    </>
  );
}

export function MyRequestsSection({ vm }: { vm: BloodFinderModel }) {
  const { t, router, styles, requests, cancelRequest, openRequests, confirmCancel, onRequestsLayout } = vm;
  return (
    <>
      {/* ── My requests ──────────────────────────────────────────────────── */}
      <View
        style={styles.stack}
        onLayout={onRequestsLayout}
      >
        <SectionHeader
          title={t('bloodFinder.myRequests')}
          actionLabel={requests.isError ? t('bloodFinder.retry') : undefined}
          onAction={requests.isError ? () => requests.refetch() : undefined}
        />

        {requests.isPending ? (
          <LoadingBlock label={t('bloodFinder.searching')} />
        ) : requests.isError ? (
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('bloodFinder.requestsFailed', {
                defaultValue: "Couldn't load your blood requests.",
              })}
              actionLabel={t('bloodFinder.retry')}
              onAction={() => requests.refetch()}
            />
          </Card>
        ) : openRequests.length === 0 ? (
          <Card variant="flush">
            <EmptyState
              icon="receipt"
              tint="blue"
              title={t('bloodFinder.myRequestsEmpty')}
              message={t('bloodFinder.myRequestsEmptyHint', {
                defaultValue:
                  'Pick a group above, then choose a facility to reserve units at. Requests you send appear here until the blood bank answers them.',
              })}
            />
          </Card>
        ) : (
          openRequests.map((request) => (
            <OpenRequestCard
              onTrack={() =>
                router.push({
                  pathname: '/blood-finder/status',
                  params: { requestId: request.id },
                })
              }
              key={request.id}
              request={request}
              cancelling={
                cancelRequest.isPending && cancelRequest.variables?.id === request.id
              }
              onCancel={() => confirmCancel(request)}
            />
          ))
        )}
      </View>
    </>
  );
}
