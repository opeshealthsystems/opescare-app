/**
 * Order from Pharmacy — dispensing for the patient's active prescriptions.
 *
 * HONEST SCOPE. The patient portal API has no dispensing or delivery
 * endpoint: `pharmacy/orders` in `routes/api.php` is the staff-side supplier
 * procurement module (`SupplierOrderController`), not something a patient may
 * call, and nothing under `patient/` places an order or books a delivery. So
 * this screen does not render a checkout it cannot honour. It shows what the
 * API really knows — which pharmacy holds each prescription, what quantity,
 * and whether it has been dispensed yet — and offers the two routes that are
 * real: phone the pharmacy, or ask the prescriber to have it prepared, sent
 * as a secure message.
 *
 * Live data (verified against https://emr.opesware.com/api/v1):
 *   GET  /patient/prescriptions?status=active
 *          → pharmacy_name, pharmacy_phone, quantity_label, is_dispensed,
 *            refills_remaining, prescribed_by, prescriber_name
 *   POST /patient/messages/threads  { provider_id, subject?, body }
 */
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { fetchPrescriptions, startThread, type PortalPrescription } from '../../api';
import { Card, EmptyState, Icon, LastUpdatedLine, ScreenHeader, StatusBadge, useDialog } from '../../components';
import { useTranslation } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  AsyncBoundary,
  MedButton,
  ROW_TINTS,
  TintCircle,
  doseSummary,
  formIcon,
  useAsync,
} from './shared';

type PharmacyGroup = {
  name: string;
  phone: string | null;
  items: PortalPrescription[];
};

export function OrderFromPharmacyScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const highlightId = (route.params?.medicationId as string | undefined) ?? null;
  const dialog = useDialog();
  const { t } = useTranslation();

  const [busyId, setBusyId] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    const page = await fetchPrescriptions({ status: 'active', per_page: 50 });
    return page.data;
  }, []);
  const state = useAsync<PortalPrescription[]>(load, []);
  const { reload } = state;

  const groups = useMemo<PharmacyGroup[]>(() => {
    const rows = state.data ?? [];
    const byName = new Map<string, PharmacyGroup>();
    for (const rx of rows) {
      // Prescriptions with no pharmacy recorded are grouped under a plain
      // human label rather than a blank heading or a raw null.
      const name = rx.pharmacy_name ?? t('meds.pharmacy.unassigned');
      const g = byName.get(name) ?? { name, phone: rx.pharmacy_phone, items: [] };
      if (!g.phone && rx.pharmacy_phone) g.phone = rx.pharmacy_phone;
      g.items.push(rx);
      byName.set(name, g);
    }
    const all = [...byName.values()];
    // The prescription we were opened from comes first.
    if (highlightId) {
      all.sort((a, b) => {
        const ai = a.items.some((r) => r.id === highlightId) ? 0 : 1;
        const bi = b.items.some((r) => r.id === highlightId) ? 0 : 1;
        return ai - bi;
      });
    }
    return all;
  }, [state.data, highlightId, t]);

  function callPharmacy(group: PharmacyGroup) {
    if (!group.phone) return;
    Linking.openURL(`tel:${group.phone.replace(/\s/g, '')}`).catch(() => {
      dialog.alert(
        t('meds.pharmacy.callFailTitle'),
        t('meds.pharmacy.callFailBody', { pharmacy: group.name, phone: group.phone! }),
        'warning'
      );
    });
  }

  function confirmRequest(rx: PortalPrescription, pharmacy: string) {
    if (rx.prescribed_by === null) {
      dialog.alert(
        t('meds.pharmacy.noPrescriberTitle'),
        t('meds.pharmacy.noPrescriberBody', { pharmacy }),
        'warning'
      );
      return;
    }

    dialog.show({
      title: rx.drug_name,
      tone: 'info',
      message: t('meds.pharmacy.confirmBody', {
        name: rx.prescriber_name ?? t('meds.pharmacy.yourPrescriber'),
        pharmacy,
      }),
      cancelLabel: t('meds.pharmacy.confirmNotNow'),
      actions: [
        { label: t('meds.pharmacy.confirmSend'), onPress: () => requestDispensing(rx, pharmacy) },
      ],
    });
  }

  async function requestDispensing(rx: PortalPrescription, pharmacy: string) {
    if (rx.prescribed_by === null || inFlight.current) return;
    inFlight.current = true;
    setBusyId(rx.id);
    try {
      const body = [
        t('meds.pharmacy.bodyAsk', { pharmacy }),
        `${rx.drug_name}${rx.dosage ? `, ${rx.dosage}` : ''}${rx.frequency ? `, ${rx.frequency}` : ''}.`,
        rx.quantity_label
          ? t('meds.pharmacy.bodyQuantity', { quantity: rx.quantity_label })
          : null,
      ]
        .filter(Boolean)
        .join('\n');

      const thread = await startThread({
        provider_id: rx.prescribed_by,
        subject: t('meds.pharmacy.subject'),
        body,
      });

      dialog.show({
        title: t('meds.pharmacy.sentTitle'),
        tone: 'success',
        message: t('meds.pharmacy.sentBody', {
          drug: rx.drug_name,
          name: thread.provider_name ?? rx.prescriber_name ?? t('meds.pharmacy.yourPrescriber'),
        }),
        cancelLabel: t('meds.pharmacy.sentDone'),
        actions: [
          {
            label: t('meds.pharmacy.openConversation'),
            onPress: () =>
              navigation.navigate('MessageThread', {
                threadId: thread.id,
                title: thread.provider_name ?? rx.prescriber_name ?? undefined,
              }),
          },
        ],
      });
    } catch (e) {
      dialog.show({
        title: t('meds.pharmacy.failTitle'),
        tone: 'critical',
        cancelLabel: t('meds.pharmacy.failOk'),
        message: writeFailureMessage(e, t('meds.pharmacy.failHint')),
      });
    } finally {
      inFlight.current = false;
      setBusyId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('meds.pharmacy.title')} subtitle={t('meds.pharmacy.subtitle')} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.loading && state.data !== null}
            onRefresh={reload}
            tintColor={colors.blue}
          />
        }
      >
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('meds.pharmacy.loading')}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <EmptyState
              icon="store"
              tint="blue"
              title={t('meds.pharmacy.emptyTitle')}
              message={t('meds.pharmacy.emptyBody')}
              actionLabel={t('meds.pharmacy.emptyCta')}
              onAction={() => navigation.navigate('Medications')}
            />
          }
        >
          {() => (
            <>
              <View style={styles.notice}>
                <Icon name="info" size={20} color={colors.blue} />
                <Text style={styles.noticeText}>{t('meds.pharmacy.notice')}</Text>
              </View>

              {groups.map((group) => (
                <Card key={group.name}>
                  <View style={styles.head}>
                    <TintCircle icon="store" tint="blue" />
                    <View style={styles.headBody}>
                      <Text style={styles.headTitle} numberOfLines={2}>
                        {group.name}
                      </Text>
                      <Text style={styles.headMeta}>
                        {group.phone ?? t('meds.pharmacy.noPhone')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.items}>
                    {group.items.map((rx, i) => (
                      <TouchableOpacity
                        key={rx.id}
                        onPress={() => confirmRequest(rx, group.name)}
                        activeOpacity={0.8}
                        disabled={busyId !== null}
                        accessibilityRole="button"
                        accessibilityLabel={t('meds.pharmacy.itemA11y', {
                          drug: rx.drug_name,
                          pharmacy: group.name,
                        })}
                        accessibilityState={{ disabled: busyId !== null, busy: busyId === rx.id }}
                        style={[styles.item, i > 0 && styles.itemDivider, busyId !== null && styles.itemLocked]}
                      >
                        <TintCircle icon={formIcon(rx)} tint={ROW_TINTS[i % ROW_TINTS.length]} size={36} />
                        <View style={styles.itemBody}>
                          <Text style={styles.itemTitle} numberOfLines={2}>
                            {rx.drug_name}
                          </Text>
                          <Text style={styles.itemMeta} numberOfLines={1}>
                            {doseSummary(rx)}
                          </Text>
                          {!!rx.quantity_label && (
                            <Text style={styles.itemMeta} numberOfLines={1}>
                              {rx.quantity_label}
                            </Text>
                          )}
                        </View>
                        {busyId === rx.id ? (
                          <ActivityIndicator color={colors.blue} />
                        ) : (
                          <StatusBadge
                            status={
                              rx.is_dispensed
                                ? t('meds.pharmacy.dispensed')
                                : t('meds.pharmacy.awaitingCollection')
                            }
                            tone={rx.is_dispensed ? 'normal' : 'pending'}
                            size="sm"
                          />
                        )}
                        <Icon name="chevron-right" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.hint}>{t('meds.pharmacy.hint')}</Text>

                  {!!group.phone && (
                    <MedButton
                      label={t('meds.pharmacy.callPharmacy')}
                      icon="phone"
                      variant="secondary"
                      size="sm"
                      onPress={() => callPharmacy(group)}
                    />
                  )}
                </Card>
              ))}

              <MedButton
                label={t('meds.pharmacy.messageDoctor')}
                icon="chat"
                variant="secondary"
                onPress={() => navigation.navigate('NewMessage', {})}
              />

              <LastUpdatedLine loadedAt={state.loadedAt} />
            </>
          )}
        </AsyncBoundary>
      </ScrollView>

      {dialog.element}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  noticeText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  headBody: { flex: 1, minWidth: 0, gap: 2 },
  headTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  headMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  items: { marginTop: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4 },
  itemDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  itemBody: { flex: 1, minWidth: 0, gap: 2 },
  itemTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  itemMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  itemLocked: { opacity: 0.5 },
  hint: {
    marginBottom: spacing.sm,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});
