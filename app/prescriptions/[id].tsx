import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Hourglass,
  NotebookPen,
  Pill,
  RotateCcw,
  Search,
  ShieldCheck,
  Store,
  Tablets,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { colors } from '../../theme/tokens';
import { useAuthStore } from '../../lib/store/auth';
import { usePrescriptionDetail, type PrescriptionItemDetail } from '../../lib/api/queries';
import { useCatalogMedicineMatch } from '../../lib/api/prescriptionQueries';
import {
  EXPIRY_WARNING_WINDOW_DAYS,
  StatusPill,
  daysUntil,
  formatDate,
  referenceCode,
} from '../../components/prescriptions/status';

/**
 * One prescription in full — issuing facility, dates, and every medication with
 * its dosage instructions.
 *
 * Modelled on the e-prescription reference (`Mobile app screens/
 * a_full_screen_smartphone_app_screenshot_of_a_medic.png`), which lays the
 * medications out as a numbered Medicine / Strength / Dosage & Instructions /
 * Duration table under an "Important — take medicines exactly as prescribed"
 * callout. A four-column table is unreadable at phone width, so each medication
 * becomes its own card with a full-width "How to take it" panel: same
 * information, same ordering, set at a size that can be read at arm's length.
 * Dosage is the one thing on this screen that must never be ambiguous, so it
 * gets the largest type and a missing value reads "Not specified" rather than a
 * dash that could be mistaken for a zero.
 *
 * Two things the reference shows that this API cannot supply, and which are
 * therefore absent rather than invented: the prescriber (the mobile endpoint
 * returns the facility only — `prescribed_by` exists on the model but is not
 * serialised) and the diagnosis. There is likewise no refill action, because
 * the mobile API has no refill route.
 */

export default function PrescriptionDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = i18n.language;

  // The reference prints a patient identity line above the medications, and a
  // pharmacist checking this at the counter needs it. It is read from the auth
  // store the session already holds — no extra request, and nothing here that
  // the signed-in patient does not already own.
  const patient = useAuthStore((s) => s.patient);

  const { data: prescription, isLoading, isError, refetch } = usePrescriptionDetail(id);

  const remaining = daysUntil(prescription?.expires_at);
  const isOpen =
    prescription?.status === 'active' || prescription?.status === 'partially_dispensed';
  const expiryDays =
    isOpen && remaining !== null && remaining >= 0 && remaining <= EXPIRY_WARNING_WINDOW_DAYS
      ? remaining
      : null;

  return (
    <Screen className="px-0">
      {/* Top bar */}
      <View className="flex-row items-center px-6 pt-2">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/prescriptions'))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('prescriptions.back')}
          className="h-10 w-10 items-center justify-center rounded-xl border border-cream-300 bg-white"
        >
          <ChevronLeft size={20} color={colors.navy.text} />
        </Pressable>
        <Text className="ml-3 flex-1 text-lg font-extrabold text-navy-text">
          {t('prescriptions.detailTitle')}
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand[500]} />
        </View>
      ) : isError || !prescription ? (
        <View className="flex-1 px-6 pt-6">
          <View className="items-center rounded-2xl border border-cream-300 bg-white px-6 py-10">
            <View
              className="h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.semantic.dangerSurface }}
            >
              <CircleAlert size={22} color={colors.semantic.danger} />
            </View>
            <Text className="mt-4 text-center text-sm text-navy-secondary">
              {isError ? t('prescriptions.detailLoadError') : t('prescriptions.notFound')}
            </Text>
            {isError ? (
              <Pressable
                onPress={() => refetch()}
                accessibilityRole="button"
                className="mt-4 flex-row items-center rounded-xl border border-brand-500 px-4 py-2"
              >
                <RotateCcw size={13} color={colors.brand[600]} />
                <Text className="ml-2 text-xs font-bold text-brand-600">
                  {t('prescriptions.retry')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Issuing facility + status. The facility is the only attribution the
              mobile API returns — there is no prescriber name to show. */}
          <View className="mt-4 rounded-2xl border border-cream-300 bg-white p-5">
            <View className="flex-row items-start">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand-50">
                <Pill size={22} color={colors.brand[600]} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-[11px] font-semibold uppercase tracking-wide text-navy-muted">
                  {t('prescriptions.issuedBy')}
                </Text>
                <Text className="mt-0.5 text-lg font-extrabold leading-6 text-navy-text">
                  {prescription.facility_name ?? t('prescriptions.unknownFacility')}
                </Text>
              </View>
            </View>

            <View className="mt-4 flex-row items-center justify-between">
              <StatusPill
                status={prescription.status}
                statusColor={prescription.status_color}
                large
              />
              <View className="flex-row items-center rounded-lg bg-cream-100 px-2.5 py-1">
                <Text className="text-[11px] font-bold text-navy-secondary">
                  {t('prescriptions.reference', { code: referenceCode(prescription.id) })}
                </Text>
              </View>
            </View>

            {expiryDays !== null ? (
              <View
                className="mt-3 flex-row items-center rounded-xl px-3 py-2.5"
                style={{ backgroundColor: colors.semantic.warningSurface }}
              >
                <Hourglass size={15} color={colors.semantic.warning} />
                <Text
                  className="ml-2 flex-1 text-xs font-bold"
                  style={{ color: colors.semantic.warning }}
                >
                  {expiryDays === 0
                    ? t('prescriptions.expiresToday')
                    : t('prescriptions.expiresInDays', { count: expiryDays })}
                </Text>
              </View>
            ) : null}

            {patient ? (
              <View className="mt-4 flex-row items-center border-t border-cream-200 pt-4">
                <UserRound size={15} color={colors.navy.muted} />
                <Text
                  className="ml-2 flex-1 text-xs font-bold text-navy-text"
                  numberOfLines={1}
                >
                  {patient.display_name}
                </Text>
                <Text className="ml-2 text-[11px] text-navy-muted">{patient.health_id}</Text>
              </View>
            ) : null}
          </View>

          {/* Key dates. The facility is deliberately not repeated here — the
              card above already carries it as the prescription's attribution. */}
          <View className="mt-4 overflow-hidden rounded-2xl border border-cream-300 bg-white px-4">
            <InfoRow
              icon={CalendarClock}
              label={t('prescriptions.prescribedAt')}
              value={formatDate(prescription.prescribed_at, locale) ?? t('prescriptions.notRecorded')}
            />
            {prescription.dispensed_at ? (
              <InfoRow
                icon={CircleCheck}
                label={t('prescriptions.dispensedAt')}
                value={formatDate(prescription.dispensed_at, locale) ?? t('prescriptions.notRecorded')}
              />
            ) : null}
            <InfoRow
              icon={Hourglass}
              label={t('prescriptions.expiresAt')}
              value={formatDate(prescription.expires_at, locale) ?? t('prescriptions.noExpiry')}
              last
            />
          </View>

          {/* Medications */}
          <View className="mb-3 mt-7 flex-row items-center">
            <Tablets size={18} color={colors.brand[600]} />
            <Text className="ml-2 flex-1 text-base font-extrabold text-navy-text">
              {t('prescriptions.medications')}
            </Text>
            <View className="rounded-lg bg-cream-200 px-2 py-0.5">
              <Text className="text-[11px] font-bold text-navy-secondary">
                {prescription.items.length}
              </Text>
            </View>
          </View>

          {prescription.items.length === 0 ? (
            <View className="items-center rounded-2xl border border-cream-300 bg-white px-6 py-8">
              <Tablets size={22} color={colors.navy.muted} />
              <Text className="mt-2 text-center text-sm text-navy-secondary">
                {t('prescriptions.noMedications')}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {prescription.items.map((item, index) => (
                <MedicationCard key={item.id} item={item} index={index + 1} locale={locale} />
              ))}
            </View>
          )}

          {/* Notes from the care team */}
          {prescription.notes ? (
            <View className="mt-4 rounded-2xl border border-cream-300 bg-white p-4">
              <View className="flex-row items-center">
                <NotebookPen size={16} color={colors.brand[600]} />
                <Text className="ml-2 text-sm font-bold text-navy-text">
                  {t('prescriptions.notes')}
                </Text>
              </View>
              <Text className="mt-2 text-sm leading-5 text-navy-secondary">
                {prescription.notes}
              </Text>
            </View>
          ) : null}

          {/* "Important" callout — carried over from the reference verbatim in
              intent: this is the one message that must survive any redesign. */}
          <View className="mt-4 flex-row rounded-2xl border border-brand-100 bg-brand-50 p-4">
            <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white">
              <ShieldCheck size={18} color={colors.brand[600]} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-navy-text">
                {t('prescriptions.safetyTitle')}
              </Text>
              <Text className="mt-1 text-xs leading-4 text-navy-secondary">
                {t('prescriptions.safetyBody')}
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

/* -- Pieces ---------------------------------------------------------------- */

function InfoRow({
  icon: Icon,
  label,
  value,
  last,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center py-3.5 ${last ? '' : 'border-b border-cream-200'}`}
    >
      <Icon size={16} color={colors.navy.muted} />
      <Text className="ml-2.5 flex-1 text-sm text-navy-secondary">{label}</Text>
      <Text className="ml-2 flex-1 text-right text-sm font-bold text-navy-text" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function MedicationCard({
  item,
  index,
  locale,
}: {
  item: PrescriptionItemDetail;
  index: number;
  locale: string;
}) {
  const { t } = useTranslation();
  const dispensedOn = formatDate(item.dispensed_at, locale);

  return (
    <View className="rounded-2xl border border-cream-300 bg-white p-4">
      {/* Name + dispense state */}
      <View className="flex-row items-start">
        <View className="h-7 w-7 items-center justify-center rounded-lg bg-brand-500">
          <Text className="text-xs font-extrabold text-white">{index}</Text>
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-lg font-extrabold leading-6 text-navy-text">{item.drug_name}</Text>
          {item.drug_code ? (
            <Text className="mt-0.5 text-[11px] text-navy-muted">
              {t('prescriptions.drugCode', { code: item.drug_code })}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="mt-2.5 flex-row items-center">
        {item.is_dispensed ? (
          <CircleCheck size={14} color={colors.semantic.success} />
        ) : (
          <CircleDashed size={14} color={colors.navy.muted} />
        )}
        <Text
          className="ml-1.5 text-xs font-bold"
          style={{ color: item.is_dispensed ? colors.semantic.success : colors.navy.muted }}
        >
          {item.is_dispensed ? t('prescriptions.itemDispensed') : t('prescriptions.itemPending')}
        </Text>
        {item.is_dispensed && dispensedOn ? (
          <Text className="ml-1.5 text-xs text-navy-muted">{`· ${dispensedOn}`}</Text>
        ) : null}
      </View>

      {/* The safety-critical block. Deliberately the loudest thing on the card. */}
      <View className="mt-3.5 overflow-hidden rounded-2xl border border-brand-100 bg-brand-50 px-4">
        <Text className="pb-1 pt-3.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">
          {t('prescriptions.howToTake')}
        </Text>
        <DosageRow label={t('prescriptions.dose')} value={item.dose} emphasis />
        <DosageRow label={t('prescriptions.frequency')} value={item.frequency} emphasis />
        <DosageRow label={t('prescriptions.route')} value={item.route} />
        <DosageRow
          label={t('prescriptions.duration')}
          value={
            item.duration_days != null
              ? t('prescriptions.durationDays', { count: item.duration_days })
              : null
          }
        />
        <DosageRow
          label={t('prescriptions.quantity')}
          value={item.quantity != null ? String(item.quantity) : null}
          last
        />
      </View>

      {item.dispense_notes ? (
        <View className="mt-3 rounded-xl bg-cream-100 px-3 py-2.5">
          <Text className="text-[11px] font-bold uppercase tracking-wide text-navy-muted">
            {t('prescriptions.dispenseNotes')}
          </Text>
          <Text className="mt-1 text-xs leading-4 text-navy-secondary">{item.dispense_notes}</Text>
        </View>
      ) : null}

      <FindNearbyRow drugName={item.drug_name} />
    </View>
  );
}

/**
 * One dosage instruction. `emphasis` marks the two lines that most change what
 * a patient actually does — how much, and how often — so they sit a size above
 * route/duration/quantity. A missing value says so in words: an em dash next to
 * "Dose" is too easy to read as "none".
 */
function DosageRow({
  label,
  value,
  emphasis,
  last,
}: {
  label: string;
  value: string | null;
  emphasis?: boolean;
  last?: boolean;
}) {
  const { t } = useTranslation();
  const missing = value == null || value.trim().length === 0;

  return (
    <View
      className={`flex-row items-center py-3 ${last ? '' : 'border-b border-brand-100'}`}
    >
      <Text className="w-24 text-[11px] font-semibold uppercase tracking-wide text-navy-muted">
        {label}
      </Text>
      <Text
        className={`flex-1 text-right ${
          missing
            ? 'text-sm text-navy-muted'
            : emphasis
              ? 'text-lg font-extrabold text-navy-text'
              : 'text-base font-bold text-navy-text'
        }`}
      >
        {missing ? t('prescriptions.notSpecified') : value}
      </Text>
    </View>
  );
}

/**
 * "Find this medicine nearby" — the bridge into the Medicine Finder.
 *
 * A prescription item carries free text, never a catalog id, so the drug name
 * is resolved against `GET /mobile/pharmacy/medicines` first. On a hit this
 * deep-links straight to `/pharmacy/[medicineId]` (which fills in its own
 * default search origin when lat/lng are omitted) and shows the real catalog
 * price floor and pharmacy count. On a miss it opens the Medicine Finder itself
 * rather than a dead end — and says so, instead of implying stock it has not
 * confirmed.
 */
function FindNearbyRow({ drugName }: { drugName: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: medicine, isPending } = useCatalogMedicineMatch(drugName);

  const price = medicine?.availability.price_min ?? null;
  const pharmacyCount = medicine?.availability.pharmacy_count ?? 0;

  const hint = medicine
    ? price != null && pharmacyCount > 0
      ? t('prescriptions.nearbyFrom', {
          price: formatXaf(price),
          count: pharmacyCount,
        })
      : t('prescriptions.nearbyInCatalog', { name: medicine.name })
    : t('prescriptions.nearbySearchInstead');

  return (
    <Pressable
      onPress={() => {
        if (medicine) {
          router.push({
            pathname: '/pharmacy/[medicineId]',
            params: { medicineId: medicine.id },
          });
        } else {
          router.push('/pharmacy');
        }
      }}
      accessibilityRole="button"
      className="mt-3.5 flex-row items-center rounded-xl border border-brand-500 px-3 py-3"
    >
      <View className="h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
        {medicine ? (
          <Store size={16} color={colors.brand[600]} />
        ) : (
          <Search size={16} color={colors.brand[600]} />
        )}
      </View>
      <View className="ml-2.5 flex-1">
        <Text className="text-xs font-bold text-brand-600">{t('prescriptions.findNearby')}</Text>
        <Text className="mt-0.5 text-[11px] text-navy-secondary" numberOfLines={1}>
          {isPending ? t('prescriptions.nearbyChecking') : hint}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.brand[600]} />
    </Pressable>
  );
}

/** XAF is quoted in whole francs, grouped with spaces — "12 500 FCFA". */
function formatXaf(value: number): string {
  const grouped = String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} FCFA`;
}
