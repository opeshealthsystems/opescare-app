/**
 * CARE-004 — Provider Profile.
 *
 * `GET /patient/providers/{id}`. The "Book Appointment" CTA is the entry point
 * to the real booking flow (CARE-008 → 009 → 010 → 011).
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchProvider, type PortalProviderDetail } from '../../api';
import { Card, Icon, IconName, ScreenHeader, SectionHeader } from '../../components';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  AsyncBoundary,
  CareButton,
  fmtMoney,
  ProviderAvatar,
  SummaryLine,
  useAsync,
} from './shared';

export function ProviderProfileScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'ProviderProfile'>>();
  const providerId = Number(params.providerId);

  const state = useAsync<PortalProviderDetail>(() => fetchProvider(providerId), [providerId]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Provider Profile" subtitle="View your provider's details, services and consultation information." />
      <ScrollView contentContainerStyle={styles.content}>
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel="Loading provider…">
          {(p) => (
            <>
              <Card>
                <View style={styles.identity}>
                  <ProviderAvatar name={p.name} size={78} />
                  <View style={styles.identityBody}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={2}>
                        {p.name}
                      </Text>
                      <Icon name="check-circle" size={18} color={colors.blue} />
                    </View>
                    <Text style={styles.title}>{p.title ?? p.specialty ?? 'Provider'}</Text>
                    <View style={styles.metaRow}>
                      <Icon name="building" size={16} color={colors.textSecondary} />
                      <Text style={styles.meta} numberOfLines={1}>
                        {p.facility_name ?? 'Facility to be confirmed'}
                      </Text>
                    </View>
                    {!!p.room && (
                      <View style={styles.metaRow}>
                        <Icon name="location" size={16} color={colors.textSecondary} />
                        <Text style={styles.meta} numberOfLines={1}>
                          {p.room}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.actions}>
                  <CircleAction
                    icon="phone"
                    label="Call"
                    disabled={!p.facility?.phone}
                    onPress={() => Linking.openURL(`tel:${(p.facility?.phone ?? '').replace(/\s/g, '')}`)}
                  />
                  <CircleAction
                    icon="chat"
                    label="Message"
                    onPress={() => navigation.navigate('NewMessage', { providerId: String(p.id) })}
                  />
                  <CircleAction
                    icon="calendar-plus"
                    label="Book"
                    onPress={() => navigation.navigate('AvailableTimeSlots', { providerId: String(p.id) })}
                  />
                  <CircleAction
                    icon="building"
                    label="Facility"
                    disabled={!p.facility_id}
                    onPress={() => p.department_id && navigation.navigate('FacilityProfile', { departmentId: String(p.department_id) })}
                  />
                </View>
              </Card>

              <View>
                <SectionHeader title="Professional Information" variant="overline" />
                <Card variant="flush">
                  <IconLine icon="stethoscope" label="Specialty" value={p.specialty ?? '—'} divider />
                  {!!p.subspecialty && <IconLine icon="heart-pulse" label="Subspecialty" value={p.subspecialty} divider />}
                  <IconLine
                    icon="document-text"
                    label="Qualification"
                    value={p.qualifications.length ? p.qualifications.join(', ') : '—'}
                    divider
                  />
                  <IconLine icon="star" label="Experience" value={`${p.years_experience}+ years`} divider />
                  {!!p.department_name && <IconLine icon="grid" label="Department" value={p.department_name} divider />}
                  <IconLine icon="globe" label="Languages" value={p.languages.length ? p.languages.join(', ') : '—'} />
                </Card>
              </View>

              {!!p.bio && (
                <View>
                  <SectionHeader title="About the Provider" variant="overline" />
                  <Card>
                    <Text style={styles.bio}>{p.bio}</Text>
                  </Card>
                </View>
              )}

              <View>
                <SectionHeader title="Consultation Details" variant="overline" />
                <Card>
                  <SummaryLine
                    label="Consultation Fee"
                    value={fmtMoney(p.consultation_fee, p.currency)}
                    valueColor={colors.link}
                    strong
                  />
                  <View style={styles.hair} />
                  <SummaryLine
                    label="Consultation Type"
                    value={p.offers_telemedicine ? 'In-Person & Telemedicine' : 'In-Person'}
                  />
                  <View style={styles.hair} />
                  <SummaryLine
                    label="New Patients"
                    value={p.accepts_new_patients ? 'Accepting' : 'Not accepting'}
                    valueColor={p.accepts_new_patients ? colors.statusNormal : colors.statusWarning}
                  />
                  <View style={styles.hair} />
                  <SummaryLine label="Currently" value={p.is_online ? 'Online' : 'Offline'} />
                </Card>
              </View>

              <View>
                <SectionHeader title="Ratings & Reviews" variant="overline" />
                <Card>
                  <View style={styles.rating}>
                    <Text style={styles.ratingScore}>{p.rating.toFixed(1)}</Text>
                    <Stars value={p.rating} />
                    <Text style={styles.ratingCount}>({p.review_count} Reviews)</Text>
                  </View>
                </Card>
              </View>

              <CareButton
                label={p.accepts_new_patients ? 'Book Appointment' : 'View Available Times'}
                icon="calendar-plus"
                onPress={() => navigation.navigate('AvailableTimeSlots', { providerId: String(p.id) })}
              />
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={18} color={n <= Math.round(value) ? colors.statusWarning : colors.border} />
      ))}
    </View>
  );
}

function IconLine({
  icon,
  label,
  value,
  divider,
}: {
  icon: IconName;
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.line, divider && styles.lineDivider]}>
      <Icon name={icon} size={20} color={colors.blue} />
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

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
  return (
    <TouchableOpacity
      style={[styles.action, disabled && styles.actionOff]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <View style={styles.actionCircle}>
        <Icon name={icon} size={22} color={colors.blue} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  identity: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 2 },
  identityBody: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textPrimary,
  },
  title: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.link },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  meta: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
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

  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, paddingVertical: 13 },
  lineDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  lineLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  lineValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },

  bio: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  hair: { height: 1, backgroundColor: colors.divider },

  rating: { alignItems: 'center', gap: 6 },
  ratingScore: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 44,
    lineHeight: 52,
    color: colors.textPrimary,
  },
  stars: { flexDirection: 'row', gap: 3 },
  ratingCount: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});
