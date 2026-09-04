/**
 * DIA-015 — Imaging Order Detail.
 *
 * The order behind a study, from `GET /patient/imaging/{id}`: who it is for,
 * what was requested, when and where it is scheduled, the order's provenance
 * and the notes attached to it — plus the actions a patient can take on an
 * order that has not been performed yet.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchImagingStudy, type ImagingStudyDetail } from '../../api';
import { Card, Icon, ScreenHeader, StatusBadge } from '../../components';
import { useTranslation } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, spacing, typography } from '../../theme/theme';
import {
  CardHeading,
  DetailLine,
  fmtDate,
  fmtDateTime,
  fmtTime,
  IconTabs,
  PersonBlock,
  priorityTone,
  statusIcon,
  statusLabel,
  statusTone,
} from './detailShared';
import { AsyncBoundary, DiagButton, titleCase, useAsync } from '../diagnostics/shared';

type Tab = 'details' | 'appointment' | 'clinical' | 'results' | 'history';

const TABS: { key: Tab; labelKey: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { key: 'details', labelKey: 'imaging.orderDetail.tabDetails', icon: 'document' },
  { key: 'appointment', labelKey: 'imaging.orderDetail.tabAppointment', icon: 'calendar-check' },
  { key: 'clinical', labelKey: 'imaging.orderDetail.tabClinical', icon: 'document-text' },
  { key: 'results', labelKey: 'imaging.orderDetail.tabResults', icon: 'download' },
  { key: 'history', labelKey: 'imaging.orderDetail.tabHistory', icon: 'history' },
];

export function ImagingOrderDetailScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'ImagingOrderDetail'>>();
  const orderId = params.orderId;
  const [tab, setTab] = useState<Tab>('details');
  const state = useAsync<ImagingStudyDetail>(() => fetchImagingStudy(orderId), [orderId]);

  const study = state.data;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('imaging.orderDetail.title')}
        right={
          study ? (
            <StatusBadge
              status={statusLabel(t, study.status)}
              tone={statusTone(study.status)}
              icon={statusIcon(study.status)}
            />
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.loading && state.data !== null}
            onRefresh={state.reload}
            tintColor={colors.blue}
          />
        }
      >
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('imaging.orderDetail.loading')}
        >
          {(order) => {
            const showDetails = tab === 'details';
            const showAppointment = tab === 'details' || tab === 'appointment';
            const showClinical = tab === 'details' || tab === 'clinical';
            const openable = order.status !== 'cancelled';

            return (
              <>
                <Text style={styles.orderNumber}>{order.order_number ?? order.study_uid ?? order.id}</Text>

                {/* ── Who / when ─────────────────────────────────────── */}
                <Card>
                  <View style={styles.twoCol}>
                    <View style={styles.colWide}>
                      <PersonBlock
                        name={order.patient.name}
                        lines={[
                          [
                            order.patient.opescare_id
                              ? t('imaging.orderDetail.opesId', {
                                  id: order.patient.opescare_id,
                                })
                              : order.patient.medical_id,
                            [
                              order.patient.age != null
                                ? t('imaging.common.yearsShort', { count: order.patient.age })
                                : null,
                              order.patient.sex ? titleCase(order.patient.sex).charAt(0) : null,
                            ]
                              .filter(Boolean)
                              .join(', '),
                          ]
                            .filter(Boolean)
                            .join('  •  '),
                          order.patient.phone,
                        ]}
                      />
                    </View>

                    <View style={styles.col}>
                      <Text style={styles.label}>{t('imaging.orderDetail.orderDate')}</Text>
                      <Text style={styles.value}>{fmtDateTime(order.ordered_at)}</Text>
                      <Text style={[styles.label, styles.labelGap]}>
                        {t('imaging.common.orderedBy')}
                      </Text>
                      <Text style={styles.value}>{order.ordered_by_name ?? '—'}</Text>
                      {!!order.ordered_by_specialty && (
                        <Text style={styles.value}>{order.ordered_by_specialty}</Text>
                      )}
                    </View>
                  </View>
                </Card>

                <IconTabs<Tab>
                  value={tab}
                  tabs={TABS.map((item) => ({ ...item, label: t(item.labelKey) }))}
                  onChange={(key) => {
                    if (key === 'results') {
                      if (order.has_report) {
                        navigation.navigate('ImagingResultDetail', { studyId: order.id });
                      }
                      return;
                    }
                    if (key === 'history') {
                      navigation.navigate('ImagingHistory');
                      return;
                    }
                    setTab(key);
                  }}
                />

                {/* ── Examination ────────────────────────────────────── */}
                {showClinical && (
                  <Card>
                    <CardHeading
                      icon="stethoscope"
                      label={t('imaging.orderDetail.examination')}
                    />
                    <View style={styles.cardBody}>
                      <DetailLine
                        label={t('imaging.orderDetail.procedure')}
                        value={order.study_name}
                      />
                      <DetailLine label={t('imaging.common.bodyPart')} value={order.body_part} />
                      <DetailLine
                        label={t('imaging.common.clinicalIndication')}
                        value={order.clinical_indication}
                      />
                      <DetailLine
                        label={t('imaging.orderDetail.priority')}
                        valueNode={
                          <StatusBadge
                            status={titleCase(order.priority)}
                            tone={priorityTone(order.priority)}
                            size="sm"
                          />
                        }
                      />
                      <DetailLine
                        label={t('imaging.common.scanType')}
                        value={`${order.modality_label}${order.view_label ? ` (${order.view_label})` : ''}`}
                        last
                      />
                    </View>
                  </Card>
                )}

                {/* ── Scheduling ─────────────────────────────────────── */}
                {showAppointment && (
                  <Card>
                    <CardHeading icon="calendar" label={t('imaging.orderDetail.scheduling')} />
                    <View style={styles.cardBody}>
                      <DetailLine
                        label={t('imaging.orderDetail.appointmentDate')}
                        value={fmtDate(order.scheduled_at ?? order.ordered_at)}
                      />
                      <DetailLine
                        label={t('imaging.orderDetail.appointmentTime')}
                        value={fmtTime(order.scheduled_at ?? order.ordered_at)}
                      />
                      <DetailLine
                        label={t('imaging.common.location')}
                        value={order.location ?? order.facility_name}
                      />
                      <DetailLine
                        label={t('imaging.orderDetail.statusLabel')}
                        valueNode={
                          <StatusBadge
                            status={statusLabel(t, order.status)}
                            tone={statusTone(order.status)}
                            size="sm"
                          />
                        }
                        last
                      />
                    </View>
                  </Card>
                )}

                {/* ── Order information ──────────────────────────────── */}
                {showDetails && (
                  <Card>
                    <CardHeading
                      icon="document"
                      label={t('imaging.orderDetail.orderInformation')}
                    />
                    <View style={styles.cardBody}>
                      <DetailLine
                        label={t('imaging.orderDetail.orderId')}
                        value={order.order_number ?? order.id}
                      />
                      <DetailLine
                        label={t('imaging.orderDetail.orderType')}
                        value={order.order_type ? titleCase(order.order_type) : null}
                      />
                      <DetailLine
                        label={t('imaging.orderDetail.orderSource')}
                        value={order.order_source}
                      />
                      <DetailLine
                        label={t('imaging.orderDetail.createdBy')}
                        value={order.ordered_by_name}
                      />
                      <DetailLine
                        label={t('imaging.orderDetail.createdAt')}
                        value={fmtDateTime(order.created_at)}
                      />
                      <DetailLine
                        label={t('imaging.orderDetail.lastUpdated')}
                        value={fmtDateTime(order.updated_at)}
                        last
                      />
                    </View>
                  </Card>
                )}

                {/* ── Notes ──────────────────────────────────────────── */}
                {showClinical && (
                  <Card>
                    <CardHeading icon="edit" label={t('imaging.orderDetail.notes')} />
                    <View style={styles.cardBody}>
                      <DetailLine
                        label={t('imaging.orderDetail.radiologistNote')}
                        value={order.radiologist_note ?? t('imaging.orderDetail.noneOnFile')}
                      />
                      <DetailLine
                        label={t('imaging.orderDetail.patientNote')}
                        value={order.patient_note ?? t('imaging.orderDetail.noneOnFile')}
                        last
                      />
                    </View>
                  </Card>
                )}

                {/* ── Actions ────────────────────────────────────────── */}
                <View style={styles.actionRow}>
                  <DiagButton
                    label={t('imaging.orderDetail.reschedule')}
                    icon="calendar-plus"
                    size="sm"
                    variant="secondary"
                    disabled={!openable || !order.appointment_id}
                    style={styles.actionButton}
                    onPress={() =>
                      navigation.navigate('RescheduleAppointment', {
                        appointmentId: order.appointment_id ?? '',
                      })
                    }
                  />
                  <DiagButton
                    label={t('imaging.orderDetail.cancelOrder')}
                    icon="x-circle"
                    size="sm"
                    variant="secondary"
                    disabled={!openable || !order.appointment_id}
                    style={styles.actionButton}
                    onPress={() =>
                      navigation.navigate('CancellationConfirmation', {
                        appointmentId: order.appointment_id ?? '',
                      })
                    }
                  />
                  <DiagButton
                    label={t('imaging.orderDetail.preparation')}
                    icon="info"
                    size="sm"
                    variant="secondary"
                    style={styles.actionButton}
                    onPress={() => navigation.navigate('ImagingPreparation', { studyId: order.id })}
                  />
                  <DiagButton
                    label={t('imaging.orderDetail.addNote')}
                    icon="chat"
                    size="sm"
                    variant="secondary"
                    style={styles.actionButton}
                    onPress={() => navigation.navigate('NewMessage', {})}
                  />
                  <DiagButton
                    label={t('imaging.orderDetail.printOrder')}
                    icon="print"
                    size="sm"
                    style={styles.actionButtonWide}
                    onPress={() => navigation.navigate('DownloadShareImaging', { studyId: order.id })}
                  />
                </View>
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },

  orderNumber: {
    marginTop: -spacing.sm,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.link,
  },

  twoCol: { flexDirection: 'row', gap: spacing.md },
  colWide: { flex: 1.3, minWidth: 0 },
  col: { flex: 1, minWidth: 0 },
  label: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  labelGap: { marginTop: spacing.sm },
  value: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  cardBody: { marginTop: spacing.md },

  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionButton: { flexGrow: 1, flexBasis: '30%' },
  actionButtonWide: { flexGrow: 1, flexBasis: '100%' },
});
