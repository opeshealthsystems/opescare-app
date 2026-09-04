/**
 * CARE-005 — Department Profile.
 *
 * OPES is one hospital, so this profiles a *department* of it rather than a
 * separate site: `GET /patient/departments/{id}` — about, services, opening
 * hours and the doctors rostered to it (each one a live entry point to
 * booking). The reference layout is unchanged; only the subject is.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import { Linking, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchDepartment, type PortalDepartmentDetail } from '../../api';
import { Card, Icon, IconName, ScreenHeader, SectionHeader } from '../../components';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { AsyncBoundary, CareButton, ProviderAvatar, RatingLine, SummaryLine, useAsync } from './shared';
import { DEPARTMENT_TYPE_ICON, DEPARTMENT_TYPE_LABEL } from './FindFacilityScreen';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function FacilityProfileScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'FacilityProfile'>>();
  const id = params.departmentId;

  const state = useAsync<PortalDepartmentDetail>(() => fetchDepartment(id), [id]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Department Profile"
        subtitle="View department details, services, contact information and hours."
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel="Loading department…">
          {(f) => {
            const address = [f.location, f.address, f.city, f.region, f.country].filter(Boolean).join(', ');
            return (
              <>
                <Card>
                  <View style={styles.identity}>
                    <View style={styles.thumb}>
                      <Icon name={DEPARTMENT_TYPE_ICON[f.department_type]} size={34} color={colors.blue} />
                    </View>
                    <View style={styles.identityBody}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name} numberOfLines={2}>
                          {f.name}
                        </Text>
                        <Icon name="check-circle" size={18} color={colors.blue} />
                      </View>
                      <View style={styles.verified}>
                        <Text style={styles.verifiedText} numberOfLines={1}>
                          {f.hospital_name ? `A department of ${f.hospital_name}` : 'Hospital department'}
                        </Text>
                      </View>
                      <View style={styles.metaRow}>
                        <Icon name="location" size={16} color={colors.textSecondary} />
                        <Text style={styles.meta}>{address}</Text>
                      </View>
                      <RatingLine rating={f.rating} reviewCount={f.review_count} color={colors.textPrimary} />
                    </View>
                  </View>

                  <View style={styles.actions}>
                    <CircleAction
                      icon="phone"
                      label="Call"
                      disabled={!f.phone}
                      onPress={() => Linking.openURL(`tel:${(f.phone ?? '').replace(/\s/g, '')}`)}
                    />
                    <CircleAction
                      icon="mail"
                      label="Email"
                      disabled={!f.email}
                      onPress={() => Linking.openURL(`mailto:${f.email}`)}
                    />
                    <CircleAction
                      icon="location"
                      label="Directions"
                      disabled={f.latitude === null || f.longitude === null}
                      onPress={() => Linking.openURL(`https://maps.google.com/?q=${f.latitude},${f.longitude}`)}
                    />
                    <CircleAction
                      icon="share"
                      label="Share"
                      onPress={() => Share.share({ message: `${f.name} — ${address}${f.phone ? ` · ${f.phone}` : ''}` })}
                    />
                  </View>
                </Card>

                {!!f.about && (
                  <View>
                    <SectionHeader title="About" variant="overline" />
                    <Card>
                      <Text style={styles.about}>{f.about}</Text>
                    </Card>
                  </View>
                )}

                <View>
                  <SectionHeader title="Department Information" variant="overline" />
                  <Card>
                    <SummaryLine label="Department Type" value={DEPARTMENT_TYPE_LABEL[f.department_type]} />
                    <View style={styles.hair} />
                    <SummaryLine label="Department Code" value={f.code} />
                    <View style={styles.hair} />
                    <SummaryLine label="Hospital" value={f.hospital_name ?? '—'} />
                    <View style={styles.hair} />
                    <SummaryLine label="Location" value={f.location ?? ([f.city, f.region].filter(Boolean).join(', ') || f.country || '—')} />
                    <View style={styles.hair} />
                    {!!f.head && (
                      <>
                        <SummaryLine label="Head of Department" value={f.head} />
                        <View style={styles.hair} />
                      </>
                    )}
                    <SummaryLine
                      label="Emergency Services"
                      value={f.is_24_7 ? 'Available 24/7' : 'During opening hours'}
                      valueColor={f.is_24_7 ? colors.statusNormal : colors.textPrimary}
                    />
                    <View style={styles.hair} />
                    <SummaryLine
                      label="Insurance"
                      value={f.accepts_insurance ? 'Accepted' : 'Not accepted'}
                      valueColor={f.accepts_insurance ? colors.statusNormal : colors.textPrimary}
                    />
                  </Card>
                </View>

                {f.services.length > 0 && (
                  <View>
                    <SectionHeader title="Services Offered" variant="overline" />
                    <Card>
                      <View style={styles.serviceGrid}>
                        {f.services.map((s) => (
                          <View key={s} style={styles.service}>
                            <Icon name="check-circle" size={16} color={colors.blue} />
                            <Text style={styles.serviceText} numberOfLines={1}>
                              {s}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </Card>
                  </View>
                )}

                <View>
                  <SectionHeader title="Contact & Hours" variant="overline" />
                  <Card>
                    {!!f.phone && <ContactLine icon="phone" value={f.phone} onPress={() => Linking.openURL(`tel:${f.phone!.replace(/\s/g, '')}`)} />}
                    {!!f.email && <ContactLine icon="mail" value={f.email} onPress={() => Linking.openURL(`mailto:${f.email}`)} />}
                    <ContactLine icon="location" value={address} />
                    <View style={styles.hoursBlock}>
                      <Text style={styles.hoursTitle}>Working Hours</Text>
                      {DAY_ORDER.filter((d) => f.opening_hours[d]).map((d) => (
                        <View key={d} style={styles.hoursRow}>
                          <Text style={styles.hoursDay}>{titleCase(d)}</Text>
                          <Text style={styles.hoursValue}>{f.opening_hours[d]}</Text>
                        </View>
                      ))}
                    </View>
                  </Card>
                </View>

                {f.providers.length > 0 && (
                  <View>
                    <SectionHeader
                      title={`Doctors in ${f.name} (${f.providers.length})`}
                      actionLabel="See all"
                      onAction={() => navigation.navigate('FindProvider', { departmentId: f.id })}
                    />
                    <Card variant="flush">
                      {f.providers.map((p, i) => (
                        <TouchableOpacity
                          key={p.id}
                          activeOpacity={0.8}
                          onPress={() => navigation.navigate('ProviderProfile', { providerId: String(p.id) })}
                          style={[styles.provider, i < f.providers.length - 1 && styles.providerDivider]}
                        >
                          <ProviderAvatar name={p.name} size={44} />
                          <View style={styles.providerBody}>
                            <Text style={styles.providerName} numberOfLines={1}>
                              {p.name}
                            </Text>
                            <Text style={styles.providerMeta} numberOfLines={1}>
                              {[p.specialty, p.room].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                          <Icon name="chevron-right" size={18} color={colors.textMuted} />
                        </TouchableOpacity>
                      ))}
                    </Card>
                  </View>
                )}

                <CareButton
                  label="Book with this Department"
                  icon="calendar-plus"
                  onPress={() =>
                    f.providers[0]
                      ? navigation.navigate('AvailableTimeSlots', { providerId: String(f.providers[0].id) })
                      : navigation.navigate('FindProvider', { departmentId: f.id })
                  }
                />
                <CareButton
                  label="Send a Message"
                  variant="secondary"
                  icon="chat"
                  onPress={() => navigation.navigate('NewMessage')}
                />
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

function ContactLine({ icon, value, onPress }: { icon: IconName; value: string; onPress?: () => void }) {
  const body = (
    <View style={styles.contact}>
      <Icon name={icon} size={20} color={colors.blue} />
      <Text style={[styles.contactText, !!onPress && styles.contactLink]}>{value}</Text>
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      {body}
    </TouchableOpacity>
  ) : (
    body
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
  thumb: {
    width: 82,
    height: 82,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityBody: { flex: 1, minWidth: 0, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  verified: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  verifiedText: { fontFamily: typography.fontFamily.semiBold, fontSize: 11, color: colors.link },
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

  hair: { height: 1, backgroundColor: colors.divider },

  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  service: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexGrow: 1,
    flexBasis: '45%',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  serviceText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.link,
  },

  contact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, paddingVertical: 9 },
  contactText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  contactLink: { color: colors.link, fontFamily: typography.fontFamily.medium },

  hoursBlock: { marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  hoursTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  hoursDay: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  hoursValue: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },

  provider: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12 },
  providerDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  providerBody: { flex: 1, minWidth: 0 },
  providerName: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  providerMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
});
