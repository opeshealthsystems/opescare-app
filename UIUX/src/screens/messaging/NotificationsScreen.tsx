/**
 * MSG-001 — Notifications.
 *
 * The full-screen notification centre behind the header bell. Reads
 * `GET /patient/notifications` newest-first, marks a single item read with
 * `POST /patient/notifications/{id}/read` when it is opened, and clears the
 * whole feed with `POST /patient/notifications/read-all`.
 *
 * Every notification the server can point at something with (`action_route`
 * plus an optional `action_id`) opens that record; the rest are read-only
 * announcements and are rendered without a chevron so they don't promise a
 * destination that isn't there.
 */
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Page,
  type PortalNotification,
} from '../../api';
import { Card, EmptyState, Icon, IconName, ListRow, ScreenHeader } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation, type TFunction } from '../../i18n';
import { colors, radii, spacing, Tint, typography } from '../../theme/theme';
import { AsyncBoundary, errorMessage, fmtDate, fmtTime, useAsync } from '../care/shared';

export type NotificationTarget = { route: string; params?: Record<string, unknown> };

/**
 * `action_route` is a feed slug, not an app route. Map it here — with the
 * record-level destination when the server sent an `action_id`, and the
 * section landing screen when it didn't.
 *
 * Exported so the Messages-tab notification sheet routes through the exact same
 * table (carrying `action_id`, mapping imaging) instead of a divergent copy.
 */
export function notificationTarget(n: PortalNotification): NotificationTarget | null {
  const id = n.action_id;
  switch (n.action_route) {
    case 'appointments':
      return id ? { route: 'AppointmentDetail', params: { appointmentId: id } } : { route: 'AppointmentsHome' };
    case 'lab-results':
      return id ? { route: 'LabResultDetail', params: { resultId: id } } : { route: 'DiagnosticsDashboard' };
    case 'imaging':
      return id ? { route: 'ImagingResultDetail', params: { studyId: id } } : { route: 'ImagingResults' };
    case 'billing':
      return id ? { route: 'PaymentRequestInvoice', params: { invoiceId: id } } : { route: 'Billing' };
    case 'medications':
      return id ? { route: 'MedicationDetail', params: { medicationId: id } } : { route: 'Medications' };
    case 'messages':
      return id
        ? { route: 'MessageThread', params: { threadId: id } }
        : { route: 'MainTabs', params: { screen: 'MessagesTab' } };
    default:
      return null;
  }
}

const CATEGORY_ICON: Record<string, IconName> = {
  appointment: 'calendar',
  lab_result: 'flask',
  imaging: 'image',
  billing: 'receipt',
  medication: 'pill',
  message: 'chat',
};

/** Feed categories are enum tokens the screen turns into prose — so chrome. */
const CATEGORY_KEY: Record<string, string> = {
  appointment: 'messaging.notifications.categoryAppointment',
  lab_result: 'messaging.notifications.categoryLabResult',
  imaging: 'messaging.notifications.categoryImaging',
  billing: 'messaging.notifications.categoryBilling',
  medication: 'messaging.notifications.categoryMedication',
  message: 'messaging.notifications.categoryMessage',
};

function tintFor(n: PortalNotification): Tint {
  if (n.severity === 'critical') return 'red';
  if (n.severity === 'warning') return 'amber';
  if (n.severity === 'success') return 'green';
  return 'blue';
}

/** An unmapped category falls back to the server's own word, tidied. */
const label = (category: string, t: TFunction) =>
  CATEGORY_KEY[category]
    ? t(CATEGORY_KEY[category])
    : category.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function NotificationsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { setNotifications } = useUnread();

  const state = useAsync<Page<PortalNotification>>(() => fetchNotifications({ per_page: 50 }), []);
  const { data, setData, reload } = state;

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const unread = data ? data.data.filter((n) => !n.is_read).length : 0;

  // Keep the header bell everywhere else honest about what's left.
  useEffect(() => {
    if (data) setNotifications(unread);
  }, [data, unread, setNotifications]);

  /** Flip one row read locally so the list doesn't flash on navigation. */
  const markLocally = useCallback(
    (id: string) => {
      if (!data) return;
      setData({
        ...data,
        data: data.data.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)),
      });
    },
    [data, setData],
  );

  const open = useCallback(
    async (n: PortalNotification) => {
      const target = notificationTarget(n);
      if (!n.is_read) {
        markLocally(n.id);
        try {
          await markNotificationRead(n.id);
        } catch {
          // The read flag is a convenience, not the point of the tap — a
          // failure here shouldn't block the patient from opening the record.
        }
      }
      if (target) navigation.navigate(target.route, target.params);
    },
    [markLocally, navigation],
  );

  const markAll = useCallback(async () => {
    if (busy || unread === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      await markAllNotificationsRead();
      reload();
    } catch (e) {
      setActionError(errorMessage(e, t('messaging.notifications.markAllFailed')));
    } finally {
      setBusy(false);
    }
  }, [busy, unread, reload, t]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('messaging.notifications.title')}
        subtitle={
          unread > 0
            ? t('messaging.notifications.subtitleUnread', { count: unread })
            : t('messaging.notifications.subtitleNone')
        }
        right={
          unread > 0 ? (
            <TouchableOpacity onPress={markAll} disabled={busy} activeOpacity={0.7} accessibilityRole="button">
              <Text style={[styles.headerAction, busy && styles.headerActionDisabled]}>
                {t('messaging.notifications.markAllRead')}
              </Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={state.loading && state.data !== null} onRefresh={reload} tintColor={colors.blue} />
        }
      >
        {!!actionError && (
          <View style={styles.notice}>
            <Icon name="alert-circle" size={16} color={colors.statusCritical} />
            <Text style={styles.noticeText}>{actionError}</Text>
          </View>
        )}

        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('messaging.notifications.loading')}
          isEmpty={(page) => page.data.length === 0}
          empty={
            <EmptyState
              icon="bell-off"
              tint="blue"
              title={t('messaging.notifications.emptyTitle')}
              message={t('messaging.notifications.emptyMessage')}
            />
          }
        >
          {(page) => (
            <Card variant="flush">
              {page.data.map((n, i) => (
                <ListRow
                  key={n.id}
                  icon={CATEGORY_ICON[n.category] ?? 'bell'}
                  tint={tintFor(n)}
                  title={n.title}
                  subtitle={n.body ?? undefined}
                  meta={
                    n.body ? undefined : [label(n.category, t), `${fmtDate(n.created_at)}, ${fmtTime(n.created_at)}`]
                  }
                  divider={i < page.data.length - 1}
                  chevron={!!notificationTarget(n)}
                  onPress={() => open(n)}
                  trailing={
                    <View style={styles.trailing}>
                      <Text style={styles.when}>{fmtDate(n.created_at)}</Text>
                      {!n.is_read && <View style={styles.dot} />}
                    </View>
                  }
                />
              ))}
            </Card>
          )}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },

  headerAction: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.link,
  },
  headerActionDisabled: { color: colors.textMuted },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.statusCriticalBg,
  },
  noticeText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.statusCritical,
  },

  trailing: { alignItems: 'flex-end', gap: spacing.xs },
  when: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  dot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.badge,
  },
});
