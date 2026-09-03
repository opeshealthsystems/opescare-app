/**
 * Appointment detail.
 *
 * There is no standalone gold/cream appointment-detail mockup in
 * `Mobile app screens/`, so the information hierarchy is taken from the two
 * closest references and recoloured to the brand:
 *   - `a_screenshot_of_a_mobile_app_ui_appointment_booki.png` (booking
 *     confirmation) — hero + reference chip, "Appointment Details" field grid,
 *     "What to Expect" panel, action row.
 *   - `a_clean_mobile_app_screenshot_ui_smartphone_portr.png` (My Appointments)
 *     — the row/pill/tile vocabulary this screen shares with the list.
 *
 * Cancellation is a REAL destructive mutation (POST
 * /mobile/appointments/{id}/cancel, which flips the row to `cancelled` and
 * releases the slot). It is confirmed by an in-screen bottom sheet rather than
 * `Alert.alert`, because `Alert.alert` is a silent no-op on React Native Web —
 * a confirm built on it would never fire in the browser preview and the button
 * would look broken.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CalendarPlus,
  CircleCheck,
  CircleX,
  Clock,
  FileText,
  Info,
  MapPin,
  RefreshCw,
  Stethoscope,
  TriangleAlert,
  UserX,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import {
  AppointmentStatusPill,
  CANCELLABLE_STATUSES,
  appointmentTypeIcon,
  appointmentTypeLabel,
  formatLongDate,
  formatLongDateTime,
  formatTime,
  relativeDayLabel,
  shortReference,
  statusLabel,
  statusVisual,
} from '../../components/appointments/presentation';
import { useAppointmentDetail, useCancelAppointment } from '../../lib/api/queries';
import { colors } from '../../theme/tokens';

// ---------------------------------------------------------------------------

function InfoRow({
  icon: Icon,
  label,
  value,
  isFirst,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  isFirst?: boolean;
}) {
  return (
    <View
      className="flex-row items-start py-3.5"
      style={
        isFirst ? undefined : { borderTopWidth: 1, borderTopColor: colors.cream[300] }
      }
    >
      <View
        className="mr-3 h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.brand[50] }}
      >
        <Icon size={16} color={colors.brand[600]} />
      </View>
      <View className="flex-1">
        <Text className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: colors.navy.muted }}>
          {label}
        </Text>
        <Text className="mt-0.5 text-[15px] font-semibold" style={{ color: colors.navy.text }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

/** Contextual banner explaining the terminal / in-progress states. */
function StateBanner({
  icon: Icon,
  tint,
  surface,
  title,
  body,
}: {
  icon: LucideIcon;
  tint: string;
  surface: string;
  title: string;
  body?: string | null;
}) {
  return (
    <View className="mt-4 flex-row items-start rounded-2xl p-4" style={{ backgroundColor: surface }}>
      <Icon size={18} color={tint} />
      <View className="ml-3 flex-1">
        <Text className="text-sm font-bold" style={{ color: tint }}>
          {title}
        </Text>
        {body ? (
          <Text className="mt-1 text-[13px] leading-5" style={{ color: colors.navy.secondary }}>
            {body}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Cancel confirmation sheet
// ---------------------------------------------------------------------------

function CancelSheet({
  visible,
  pending,
  errorMessage,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  pending: boolean;
  errorMessage: string | null;
  onDismiss: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            className="max-h-[88%] rounded-t-3xl px-6 pb-8 pt-5"
            style={{ backgroundColor: colors.cream[100] }}
          >
            <View className="mb-4 flex-row items-start justify-between">
              <View
                className="h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.semantic.dangerSurface }}
              >
                <TriangleAlert size={22} color={colors.semantic.danger} />
              </View>
              <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" disabled={pending}>
                <X size={20} color={colors.navy.muted} />
              </Pressable>
            </View>

            <Text className="text-lg font-extrabold" style={{ color: colors.navy.text }}>
              {t('appointments.detail.cancelConfirmTitle')}
            </Text>
            <Text className="mt-1.5 text-sm leading-5" style={{ color: colors.navy.secondary }}>
              {t('appointments.detail.cancelConfirmBody')}
            </Text>

            <View
              className="mt-4 rounded-2xl p-4"
              style={{ backgroundColor: colors.semantic.dangerSurface }}
            >
              {[
                t('appointments.detail.cancelConsequence1'),
                t('appointments.detail.cancelConsequence2'),
                t('appointments.detail.cancelConsequence3'),
              ].map((line) => (
                <View key={line} className="flex-row items-start py-1">
                  <View
                    className="mr-2.5 mt-1.5 h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: colors.semantic.danger }}
                  />
                  <Text className="flex-1 text-[13px] leading-5" style={{ color: colors.navy.text }}>
                    {line}
                  </Text>
                </View>
              ))}
            </View>

            <Text className="mb-2 mt-5 text-xs font-semibold" style={{ color: colors.navy.secondary }}>
              {t('appointments.detail.cancelReasonLabel')}
            </Text>
            <TextInput
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                borderWidth: 1,
                borderColor: colors.cream[300],
                backgroundColor: colors.white,
                color: colors.navy.text,
                minHeight: 76,
              }}
              placeholder={t('appointments.detail.cancelReasonPlaceholder')}
              placeholderTextColor={colors.navy.muted}
              value={reason}
              onChangeText={setReason}
              multiline
              textAlignVertical="top"
              maxLength={1000}
              editable={!pending}
            />

            {errorMessage ? (
              <Text
                className="mt-3 text-center text-sm font-semibold"
                style={{ color: colors.semantic.danger }}
              >
                {errorMessage}
              </Text>
            ) : null}

            <Pressable
              onPress={() => onConfirm(reason.trim())}
              disabled={pending}
              accessibilityRole="button"
              className="mt-5 h-14 flex-row items-center justify-center rounded-2xl"
              style={{
                backgroundColor: colors.semantic.danger,
                opacity: pending ? 0.7 : 1,
                gap: 8,
              }}
            >
              {pending ? (
                <>
                  <ActivityIndicator color={colors.white} />
                  <Text className="text-base font-bold" style={{ color: colors.white }}>
                    {t('appointments.detail.cancelling')}
                  </Text>
                </>
              ) : (
                <>
                  <CircleX size={18} color={colors.white} />
                  <Text className="text-base font-bold" style={{ color: colors.white }}>
                    {t('appointments.detail.cancelConfirmYes')}
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable
              onPress={onDismiss}
              disabled={pending}
              accessibilityRole="button"
              className="mt-3 h-14 items-center justify-center rounded-2xl"
              style={{ borderWidth: 1, borderColor: colors.cream[300], backgroundColor: colors.white }}
            >
              <Text className="text-base font-semibold" style={{ color: colors.navy.text }}>
                {t('appointments.detail.cancelConfirmNo')}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export default function AppointmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = i18n.language;

  const { data: appointment, isLoading, isError, refetch } = useAppointmentDetail(id);
  const cancelMutation = useCancelAppointment();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [justCancelled, setJustCancelled] = useState(false);

  const confirmCancel = (reason: string) => {
    if (!appointment) return;
    setCancelError(null);
    cancelMutation.mutate(
      { id: appointment.id, reason: reason || undefined },
      {
        onSuccess: () => {
          setSheetOpen(false);
          setJustCancelled(true);
        },
        onError: () => setCancelError(t('appointments.detail.cancelError')),
      },
    );
  };

  const header = (
    <View className="flex-row items-center px-6 pt-2">
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        accessibilityRole="button"
        className="h-11 w-11 items-center justify-center rounded-full"
        style={{ borderWidth: 1, borderColor: colors.brand[300] }}
      >
        <ArrowLeft size={18} color={colors.brand[600]} />
      </Pressable>
      <Text className="ml-4 text-lg font-extrabold" style={{ color: colors.navy.text }}>
        {t('appointments.detail.title')}
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <Screen className="px-0">
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand[500]} />
        </View>
      </Screen>
    );
  }

  if (isError || !appointment) {
    return (
      <Screen className="px-0">
        {header}
        <View className="flex-1 items-center justify-center px-10">
          <View
            className="h-20 w-20 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.semantic.dangerSurface }}
          >
            <TriangleAlert size={30} color={colors.semantic.danger} />
          </View>
          <Text
            className="mt-5 text-center text-base font-bold"
            style={{ color: colors.navy.text }}
          >
            {isError ? t('appointments.detail.loadError') : t('appointments.detail.notFound')}
          </Text>
          {isError ? (
            <Pressable
              onPress={() => refetch()}
              accessibilityRole="button"
              className="mt-5 flex-row items-center rounded-full px-5 py-3"
              style={{ borderWidth: 1, borderColor: colors.brand[500], gap: 8 }}
            >
              <RefreshCw size={15} color={colors.brand[600]} />
              <Text className="text-sm font-semibold" style={{ color: colors.brand[600] }}>
                {t('appointments.retry')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Screen>
    );
  }

  const TypeIcon = appointmentTypeIcon(appointment.appointment_type);
  const visual = statusVisual(appointment.status);
  const relative = relativeDayLabel(appointment.scheduled_at, t);
  const longDate = formatLongDate(appointment.scheduled_at, locale);
  const time = formatTime(appointment.scheduled_at, locale);
  const canCancel = CANCELLABLE_STATUSES.includes(appointment.status);
  const isUpcomingState = canCancel || appointment.status === 'checked_in';
  // Surfaced whenever the API sends them, not only when status === 'cancelled':
  // a facility can record a cancellation reason against a row whose status has
  // since moved on, and silently dropping it would hide real information.
  const hasCancellationInfo = Boolean(appointment.cancellation_reason || appointment.cancelled_at);

  return (
    <Screen className="px-0">
      {header}

      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 48 }}
      >
        {/* Hero */}
        <View
          className="rounded-3xl p-5"
          style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cream[300] }}
        >
          <View className="flex-row items-center justify-between">
            <AppointmentStatusPill
              status={appointment.status}
              label={statusLabel(appointment.status, t)}
              size="md"
            />
            <View
              className="rounded-full px-3 py-1.5"
              style={{ backgroundColor: colors.cream[200] }}
            >
              <Text className="text-[11px] font-bold" style={{ color: colors.navy.secondary }}>
                {shortReference(appointment.id)}
              </Text>
            </View>
          </View>

          <View className="mt-4 flex-row items-center">
            <View
              className="h-14 w-14 items-center justify-center rounded-2xl"
              style={{ backgroundColor: colors.brand[50] }}
            >
              <TypeIcon size={26} color={colors.brand[600]} />
            </View>
            <View className="ml-3.5 flex-1">
              <Text className="text-[22px] font-extrabold" style={{ color: colors.navy.text }}>
                {appointmentTypeLabel(appointment.appointment_type, t)}
              </Text>
              {appointment.provider_name ? (
                <Text
                  className="mt-0.5 text-sm"
                  style={{ color: colors.navy.secondary }}
                  numberOfLines={1}
                >
                  {appointment.provider_name}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Date / time band */}
          <View className="mt-4 rounded-2xl p-4" style={{ backgroundColor: colors.brand[50] }}>
            <View className="flex-row items-center">
              <CalendarDays size={16} color={colors.brand[600]} />
              <Text
                className="ml-2 flex-1 text-sm font-bold"
                style={{ color: colors.navy.text }}
              >
                {longDate ?? t('appointments.noDate')}
              </Text>
            </View>
            <View className="mt-2 flex-row items-center">
              <Clock size={16} color={colors.brand[600]} />
              <Text className="ml-2 text-sm font-semibold" style={{ color: colors.navy.text }}>
                {time ?? '—'}
              </Text>
              {relative ? (
                <>
                  <View
                    className="mx-2.5 h-3 w-px"
                    style={{ backgroundColor: colors.brand[100] }}
                  />
                  <Text className="text-[13px] font-bold" style={{ color: colors.brand[600] }}>
                    {relative}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </View>

        {/* Post-cancel confirmation, shown only for the action just performed */}
        {justCancelled ? (
          <StateBanner
            icon={CircleCheck}
            tint={colors.semantic.success}
            surface={colors.semantic.successSurface}
            title={t('appointments.detail.cancelSuccess')}
          />
        ) : null}

        {/* Contextual state banners */}
        {appointment.status === 'cancelled' && !justCancelled ? (
          <StateBanner
            icon={CircleX}
            tint={colors.semantic.danger}
            surface={colors.semantic.dangerSurface}
            title={t('appointments.detail.cancelledBanner')}
          />
        ) : null}
        {appointment.status === 'no_show' ? (
          <StateBanner
            icon={UserX}
            tint={colors.semantic.warning}
            surface={colors.semantic.warningSurface}
            title={t('appointments.detail.noShowBanner')}
            body={
              appointment.no_show_at
                ? `${t('appointments.detail.noShowAt')}: ${formatLongDateTime(appointment.no_show_at, locale, '—')}`
                : null
            }
          />
        ) : null}
        {appointment.status === 'completed' ? (
          <StateBanner
            icon={CircleCheck}
            tint={colors.semantic.success}
            surface={colors.semantic.successSurface}
            title={t('appointments.detail.completedBanner')}
          />
        ) : null}
        {appointment.status === 'checked_in' ? (
          <StateBanner
            icon={MapPin}
            tint={visual.fg}
            surface={visual.bg}
            title={t('appointments.detail.checkedInBanner')}
          />
        ) : null}

        {/* Details */}
        <Text className="mb-3 mt-6 text-base font-bold" style={{ color: colors.navy.text }}>
          {t('appointments.detail.sectionDetails')}
        </Text>
        <View
          className="rounded-3xl px-4"
          style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cream[300] }}
        >
          <InfoRow
            icon={TypeIcon}
            label={t('appointments.detail.type')}
            value={appointmentTypeLabel(appointment.appointment_type, t)}
            isFirst
          />
          <InfoRow
            icon={CalendarDays}
            label={t('appointments.detail.dateTime')}
            value={formatLongDateTime(appointment.scheduled_at, locale, t('appointments.noDate'))}
          />
          {appointment.facility_name ? (
            <InfoRow
              icon={Building2}
              label={t('appointments.detail.facility')}
              value={appointment.facility_name}
            />
          ) : null}
          {appointment.provider_name ? (
            <InfoRow
              icon={Stethoscope}
              label={t('appointments.detail.provider')}
              value={appointment.provider_name}
            />
          ) : null}
          <InfoRow
            icon={FileText}
            label={t('appointments.detail.reason')}
            value={appointment.reason || t('appointments.detail.noReason')}
          />
          {appointment.checked_in_at ? (
            <InfoRow
              icon={Clock}
              label={t('appointments.detail.checkedInAt')}
              value={formatLongDateTime(appointment.checked_in_at, locale, '—')}
            />
          ) : null}
        </View>

        {/* Cancellation record */}
        {hasCancellationInfo ? (
          <>
            <Text className="mb-3 mt-6 text-base font-bold" style={{ color: colors.navy.text }}>
              {t('appointments.detail.cancellationReason')}
            </Text>
            <View
              className="rounded-3xl px-4"
              style={{
                backgroundColor: colors.white,
                borderWidth: 1,
                borderColor: colors.semantic.dangerSurface,
              }}
            >
              <InfoRow
                icon={CircleX}
                label={t('appointments.detail.cancellationReason')}
                value={appointment.cancellation_reason || t('appointments.detail.noReason')}
                isFirst
              />
              {appointment.cancelled_at ? (
                <InfoRow
                  icon={Clock}
                  label={t('appointments.detail.cancelledAt')}
                  value={formatLongDateTime(appointment.cancelled_at, locale, '—')}
                />
              ) : null}
            </View>
          </>
        ) : null}

        {/* What to expect — only meaningful while the visit is still ahead */}
        {isUpcomingState ? (
          <View
            className="mt-6 flex-row items-start rounded-3xl p-4"
            style={{ backgroundColor: colors.semantic.infoSurface }}
          >
            <Info size={18} color={colors.semantic.info} />
            <View className="ml-3 flex-1">
              <Text className="text-sm font-bold" style={{ color: colors.navy.text }}>
                {t('appointments.detail.whatToExpect')}
              </Text>
              <Text className="mt-1 text-[13px] leading-5" style={{ color: colors.navy.secondary }}>
                {t('appointments.detail.whatToExpectBody')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Actions */}
        {canCancel ? (
          <Pressable
            onPress={() => {
              setCancelError(null);
              setSheetOpen(true);
            }}
            accessibilityRole="button"
            className="mt-6 h-14 flex-row items-center justify-center rounded-2xl"
            style={{ borderWidth: 1.5, borderColor: colors.semantic.danger, gap: 8 }}
          >
            <CircleX size={18} color={colors.semantic.danger} />
            <Text className="text-base font-bold" style={{ color: colors.semantic.danger }}>
              {t('appointments.detail.cancelButton')}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/appointments/book')}
            accessibilityRole="button"
            className="mt-6 h-14 flex-row items-center justify-center rounded-2xl"
            style={{ borderWidth: 1.5, borderColor: colors.brand[500], gap: 8 }}
          >
            <CalendarPlus size={18} color={colors.brand[600]} />
            <Text className="text-base font-bold" style={{ color: colors.brand[600] }}>
              {t('appointments.detail.bookFollowUp')}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <CancelSheet
        visible={sheetOpen}
        pending={cancelMutation.isPending}
        errorMessage={cancelError}
        onDismiss={() => {
          if (cancelMutation.isPending) return;
          setSheetOpen(false);
          setCancelError(null);
        }}
        onConfirm={confirmCancel}
      />
    </Screen>
  );
}
