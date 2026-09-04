/**
 * CORE-007 — My Health ID.
 *
 * The navy ID card with a real scannable QR (`GET /patient/health-id`), the
 * action rail, the connected-ecosystem strip (counted from
 * `GET /patient/facilities`) and the security banner.
 */
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  fetchHealthId,
  findFacilities,
  type HealthIdCard,
  type PortalFacility,
} from '../../api';
import { Card, Icon, IconName, ScreenHeader, StatusBadge } from '../../components';
import { PulseLogo } from '../../components/PulseLogo';
import { useTranslation, type TFunction } from '../../i18n';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { QrCode } from '../../utils/QrCode';
import { AsyncBoundary, CareButton, fmtDate, useAsync } from '../care/shared';
import { cacheKeys } from '../../lib/offlineCache';
import { ActionTile, BrandHeader, CardField } from './shared';

type HealthIdData = {
  card: HealthIdCard;
  facilities: PortalFacility[];
};

/** The five ecosystem groups on the reference, in order. */
const ECOSYSTEM: { labelKey: string; icon: IconName; types: PortalFacility['facility_type'][] }[] = [
  { labelKey: 'healthId.groupHospitals', icon: 'building', types: ['hospital'] },
  { labelKey: 'healthId.groupClinics', icon: 'first-aid', types: ['clinic', 'health_centre'] },
  { labelKey: 'healthId.groupLaboratories', icon: 'flask', types: ['laboratory'] },
  { labelKey: 'healthId.groupPharmacies', icon: 'capsule', types: ['pharmacy'] },
  { labelKey: 'healthId.groupImaging', icon: 'image', types: ['imaging_centre'] },
];

async function load(): Promise<HealthIdData> {
  const [card, facilities] = await Promise.all([fetchHealthId(), findFacilities({ per_page: 100 })]);
  return { card, facilities: facilities.data };
}

export function MyHealthIdScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  // Cached: this card is what a patient presents at a facility desk, in a
  // building with poor reception. It must render without a live connection.
  const state = useAsync<HealthIdData>(load, [], { cacheKey: cacheKeys.healthId });
  const { reload } = state;

  /**
   * The OS share sheet is the real entry point for saving and printing on both
   * platforms, so "Share ID", "Download" and "Print Card" all open it.
   */
  const share = (card: HealthIdCard, subject: string) =>
    Share.share({
      title: subject,
      message: t('healthId.shareBody', {
        name: card.full_name,
        id: card.health_id,
        issuer: card.issued_by,
        payload: card.qr_payload,
      }),
    }).catch(() => undefined);

  return (
    <View style={styles.screen}>
      <BrandHeader
        onBack={() => navigation.goBack()}
        onBell={() => navigation.navigate('Notifications')}
        right={
          <TouchableOpacity
            onPress={() => navigation.navigate('MainTabs', { screen: 'ProfileTab' })}
            accessibilityRole="button"
            accessibilityLabel={t('components.moreOptions')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="more-vertical" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        }
      />

      <ScreenHeader
        title={t('healthId.title')}
        subtitle={t('healthId.subtitle')}
        showBack={false}
        right={
          <CareButton
            label={t('healthId.about')}
            iconRight="info"
            variant="secondary"
            size="sm"
            onPress={() => navigation.navigate('MainTabs', { screen: 'ProfileTab', params: { sheet: 'privacy' } })}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={state.loading && state.data !== null}
            onRefresh={reload}
            tintColor={colors.blue}
          />
        }
      >
        <AsyncBoundary state={state} onLink={reload} loadingLabel={t('healthId.loading')}>
          {(d) => (
            <>
              <IdCard card={d.card} t={t} />

              {/*
                Five action tiles do not fit five-across on a phone: single
                words like "Departments" / « Établissements » (94px at 12pt)
                are far wider than a 39px column at 320, so a fixed grid broke
                them mid-word ("Depart ments"). A horizontal rail lets each
                tile size to its label and keeps every word whole at 320/375,
                EN and FR.
              */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tileRail}
              >
                <View style={styles.tileSlot}>
                  <ActionTile
                    icon="qr"
                    label={t('healthId.tileShare')}
                    caption={t('healthId.tileShareCaption')}
                    onPress={() => share(d.card, t('healthId.shareSubject'))}
                  />
                </View>
                <View style={styles.tileSlot}>
                  <ActionTile
                    icon="building"
                    label={t('healthId.tileDepartments')}
                    caption={t('healthId.tileDepartmentsCaption', { count: d.facilities.length })}
                    onPress={() => navigation.navigate('FindFacility')}
                  />
                </View>
                <View style={styles.tileSlot}>
                  <ActionTile
                    icon="history"
                    label={t('healthId.tileActivity')}
                    caption={t('healthId.tileActivityCaption')}
                    onPress={() => navigation.navigate('Notifications')}
                  />
                </View>
                <View style={styles.tileSlot}>
                  <ActionTile
                    icon="download"
                    label={t('healthId.tileDownload')}
                    caption={t('healthId.tileDownloadCaption')}
                    onPress={() => share(d.card, t('healthId.shareQrSubject'))}
                  />
                </View>
                <View style={styles.tileSlot}>
                  <ActionTile
                    icon="print"
                    label={t('healthId.tilePrint')}
                    caption={t('healthId.tilePrintCaption')}
                    onPress={() => share(d.card, t('healthId.shareCardSubject'))}
                  />
                </View>
              </ScrollView>

              <Ecosystem
                facilities={d.facilities}
                t={t}
                onPress={() => navigation.navigate('FindFacility')}
              />

              <Card style={styles.security}>
                <View style={styles.securityRow}>
                  <View style={styles.securityCircle}>
                    <Icon name="lock" size={26} color={colors.blue} />
                  </View>
                  <View style={styles.securityText}>
                    <Text style={styles.securityCopy}>{t('healthId.securityCopy')}</Text>
                    <TouchableOpacity
                      style={styles.securityLinkRow}
                      onPress={() => navigation.navigate('MainTabs', { screen: 'ProfileTab', params: { sheet: 'privacy' } })}
                      accessibilityRole="button"
                    >
                      <Text style={styles.securityLink}>{t('healthId.securityLink')}</Text>
                      <Icon name="chevron-right" size={16} color={colors.link} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

// ── The card ──────────────────────────────────────────────────────────────

function IdCard({ card, t }: { card: HealthIdCard; t: TFunction }) {
  // Backend emits 'pending' for provisional (self-registered, not-yet-verified)
  // patients alongside 'verified' / 'suspended'; the HealthIdCard.status union
  // in src/api/dashboard.ts carries all three.
  const status = card.status;
  const badge =
    status === 'verified'
      ? { tone: 'normal' as const, label: t('healthId.statusVerified') }
      : status === 'pending'
        ? { tone: 'warning' as const, label: t('healthId.statusPending') }
        : { tone: 'critical' as const, label: t('healthId.statusSuspended') };

  return (
    <View style={styles.navyFrame}>
      <View style={styles.cardFace}>
        <View style={styles.cardTop}>
          <View style={styles.cardBrand}>
            <PulseLogo size={44} />
            <View>
              <Text style={styles.cardBrandOpes}>OPES</Text>
              <Text style={styles.cardBrandSub}>{t('healthId.cardBrandSub')}</Text>
            </View>
          </View>
          <View style={styles.cardStatus}>
            <Text style={styles.cardStatusLabel}>{t('healthId.cardStatusLabel')}</Text>
            <StatusBadge
              status={badge.label}
              tone={badge.tone}
              icon="shield-check"
              size="sm"
            />
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardFields}>
            <CardField label={t('healthId.fieldHealthId')} value={card.health_id} />
            <CardField label={t('healthId.fieldFullName')} value={card.full_name} />
            <CardField
              label={t('healthId.fieldDateOfBirth')}
              value={card.date_of_birth ? fmtDate(card.date_of_birth) : '—'}
            />
            <CardField label={t('healthId.fieldGender')} value={card.sex ? capitalise(card.sex) : '—'} />
            <CardField label={t('healthId.fieldPhone')} value={card.phone ?? '—'} />
          </View>

          <View style={styles.cardQrCol}>
            <View style={styles.qrBox}>
              <QrCode value={card.qr_payload} size={132} quietZone={1} />
            </View>
            <Text style={styles.qrCaption}>{t('healthId.scanToVerify')}</Text>
            <Text style={styles.qrMeta}>
              {t('healthId.lastUpdated', { date: card.linked_at ? fmtDate(card.linked_at) : '—' })}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.cardFoot}>
        <Icon name="shield-check" size={20} color={colors.textOnBrand} />
        <Text style={styles.cardFootCopy}>{t('healthId.cardFootCopy')}</Text>
        <View style={styles.cardFootBrand}>
          <Text style={styles.cardFootBrandTitle}>{t('healthId.cardFootBrand')}</Text>
          <Text style={styles.cardFootBrandSub}>{t('healthId.cardFootBrandSub')}</Text>
        </View>
      </View>
    </View>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Connected ecosystem ───────────────────────────────────────────────────

function Ecosystem({
  facilities,
  t,
  onPress,
}: {
  facilities: PortalFacility[];
  t: TFunction;
  onPress: () => void;
}) {
  const count = (types: PortalFacility['facility_type'][]) =>
    facilities.filter((f) => types.includes(f.facility_type)).length;

  return (
    <Card>
      <View style={styles.ecoHeader}>
        <Text style={styles.ecoTitle}>{t('healthId.ecosystemTitle')}</Text>
        <TouchableOpacity onPress={onPress} accessibilityRole="button">
          <Text style={styles.ecoAction}>
            {t('healthId.activeConnections', { count: facilities.length })}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.ecoRow}>
        {ECOSYSTEM.map((group) => {
          const n = count(group.types);
          return (
            <View key={group.labelKey} style={styles.ecoCell}>
              <View style={styles.ecoCircle}>
                <Icon name={group.icon} size={22} color={colors.navy} />
                {n > 0 ? (
                  <View style={styles.ecoTick}>
                    <Icon name="check" size={10} color={colors.textOnBrand} strokeWidth={2.6} />
                  </View>
                ) : null}
              </View>
              <Text style={styles.ecoLabel} numberOfLines={2}>
                {t(group.labelKey)}
              </Text>
              <Text style={styles.ecoCount}>{t('healthId.connected', { count: n })}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },

  navyFrame: {
    backgroundColor: colors.navy,
    borderRadius: radii.lg,
    padding: 10,
  },
  cardFace: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 14,
    gap: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardBrand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardBrandOpes: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.navy,
  },
  cardBrandSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.navy,
  },
  cardStatus: { alignItems: 'flex-end', gap: 4 },
  cardStatusLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 9,
    letterSpacing: 0.6,
    color: colors.textMuted,
  },

  cardBody: { flexDirection: 'row', gap: spacing.md },
  cardFields: { flex: 1, minWidth: 0, gap: 10 },
  cardQrCol: { alignItems: 'center', gap: 4 },
  qrBox: {
    padding: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  qrCaption: {
    marginTop: 4,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
  },
  qrMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    color: colors.textMuted,
  },

  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 6,
    paddingTop: 12,
    paddingBottom: 4,
  },
  cardFootCopy: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textOnBrand,
  },
  cardFootBrand: { alignItems: 'flex-end' },
  cardFootBrandTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.4,
    color: colors.textOnBrand,
  },
  cardFootBrandSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 7,
    letterSpacing: 0.4,
    color: colors.textOnBrand,
  },

  // Horizontal action rail: gap between tiles, and a trailing inset so the last
  // tile clears the screen edge when the rail is scrolled to its end.
  tileRail: { gap: spacing.sm, paddingRight: spacing.md },
  // 112px holds the longest single word ("Établissements", 94px at 12pt
  // semi-bold) on one line with padding to spare, at every viewport width.
  tileSlot: { width: 112 },

  ecoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  ecoTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textPrimary,
  },
  ecoAction: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.link,
  },
  ecoRow: { flexDirection: 'row', gap: 4 },
  ecoCell: { flex: 1, alignItems: 'center', gap: 4 },
  ecoCircle: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ecoTick: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.statusNormal,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ecoLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  ecoCount: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 9,
    color: colors.textMuted,
    textAlign: 'center',
  },

  security: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  securityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  securityCircle: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityText: { flex: 1, minWidth: 0, gap: 6 },
  securityCopy: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  securityLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  securityLink: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.link,
  },
});
