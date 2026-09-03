import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Linking from 'expo-linking';
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileText,
  FlaskConical,
  FolderOpen,
  Hash,
  Lock,
  Pill,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Syringe,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../components/ui/Screen';
import {
  CARD_SHADOW,
  Chip,
  ChoiceChip,
  EmptyState,
  InlineNotice,
  RightsHeader,
  humanizeSlug,
  toneColors,
  type Tone,
} from '../components/privacy/DataRightsUi';
import { useDocumentViewer } from '../lib/api/queries';
import { useDocumentLibrary } from '../lib/api/privacyQueries';
import type { OfficialDocument } from '../lib/api/types';
import { colors } from '../theme/tokens';

/**
 * Documents — the official, independently verifiable papers a facility has
 * issued to the patient (discharge summaries, lab reports, medical
 * certificates, vaccination cards…).
 *
 * Reference: `Mobile app screens/a_tall_smartphone_app_screenshot_ui_mobile_health.png`
 * — the "Documents" screen, already drawn in the gold/cream brand: title +
 * subtitle, a search field, a row of counted category chips, one white card
 * per document with a tinted rounded-square icon tile, title, source, a meta
 * line, and a colour-coded category pill, closing on a gold privacy block
 * with a "Manage Access" button.
 *
 * Two deliberate departures from that reference, both because the API does not
 * support what it draws:
 *  - No "Upload" button. There is no mobile document-upload endpoint; every
 *    document here is issued by a facility, so an upload affordance would be a
 *    dead end and would misrepresent where these documents come from.
 *  - The meta line shows the reference number instead of "PDF · 1.2 MB". The
 *    list endpoint returns no file format or size, and inventing them on a
 *    document the patient may hand to a third party is not acceptable.
 * "Manage Access" is wired to the real privacy hub.
 *
 * GET /mobile/documents returns an empty list for a patient with no issued
 * documents, so the empty state is the state most patients will actually see:
 * it is built to read as "nothing has been issued yet", with a real next step,
 * rather than as a broken screen. Nothing here is fabricated — the list, the
 * verification code and the verify URL all come from the API.
 */

/** Icon + tint per document type, following the reference's colour coding
 * (lab green, clinical coral, records blue, prescription amber). */
const TYPE_META: Record<string, { icon: LucideIcon; tone: Tone }> = {
  discharge_summary: { icon: FileText, tone: 'danger' },
  lab_report: { icon: FlaskConical, tone: 'success' },
  referral_letter: { icon: Send, tone: 'warning' },
  vaccination_card: { icon: Syringe, tone: 'info' },
  medical_certificate: { icon: BadgeCheck, tone: 'info' },
  prescription: { icon: Pill, tone: 'brand' },
  invoice: { icon: Hash, tone: 'muted' },
};

type Notice = { tone: Tone; icon: LucideIcon; body: string };

export default function DocumentsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';

  const library = useDocumentLibrary();
  const viewer = useDocumentViewer();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const documents = library.data?.documents ?? [];
  const total = library.data?.total ?? 0;

  const typeLabel = (type: string) =>
    t(`documents.type.${type}`, { defaultValue: humanizeSlug(type) });

  /** Distinct types present, with their counts — the reference's counted
   * chip row. Only offered once there is genuinely something to narrow down. */
  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) counts.set(doc.document_type, (counts.get(doc.document_type) ?? 0) + 1);
    return [...counts.entries()].map(([type, count]) => ({ type, count }));
  }, [documents]);

  /** Search runs over what the list actually carries — title, issuing
   * facility, document number and verification code. */
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents.filter((doc) => {
      if (typeFilter !== 'all' && doc.document_type !== typeFilter) return false;
      if (!needle) return true;
      return [doc.title, doc.facility_name, doc.document_number, doc.verification_code]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(needle));
    });
  }, [documents, typeFilter, query]);

  const isNarrowed = typeFilter !== 'all' || query.trim().length > 0;

  const handleView = (doc: OfficialDocument) => {
    setNotice(null);
    setOpeningId(doc.id);
    // The backend mints a fresh, short-lived verify_url per view, so the URL is
    // fetched at tap time rather than cached with the list.
    viewer.mutate(doc.id, {
      onSuccess: async (detail) => {
        setOpeningId(null);
        if (!detail.verify_url) {
          setNotice({ tone: 'danger', icon: CircleAlert, body: t('documents.noVerifyUrl') });
          return;
        }
        try {
          await Linking.openURL(detail.verify_url);
        } catch {
          setNotice({ tone: 'danger', icon: CircleAlert, body: t('documents.viewError') });
        }
      },
      onError: () => {
        setOpeningId(null);
        setNotice({ tone: 'danger', icon: CircleAlert, body: t('documents.viewError') });
      },
    });
  };

  const header = (
    <View>
      <RightsHeader
        title={t('documents.title')}
        subtitle={t('documents.subtitle')}
        icon={ShieldCheck}
      />

      <View className="mt-5">
        <InlineNotice
          tone="brand"
          icon={BadgeCheck}
          title={t('documents.verifiedTitle')}
          body={t('documents.verifiedBody')}
        />
      </View>

      {notice ? (
        <View className="mt-3">
          <InlineNotice tone={notice.tone} icon={notice.icon} body={notice.body} />
        </View>
      ) : null}

      {documents.length > 0 ? (
        <>
          {/* Search — the reference's "Search documents…" field, running over
              the fields the list endpoint actually returns. */}
          <View
            className="mt-5 flex-row items-center rounded-2xl bg-white px-4"
            style={{ borderWidth: 1, borderColor: colors.cream[300], height: 48 }}
          >
            <Search size={17} color={colors.navy.muted} />
            <TextInput
              className="ml-2.5 flex-1 text-[14px] text-navy-text"
              placeholder={t('documents.searchPlaceholder')}
              placeholderTextColor={colors.navy.muted}
              autoCapitalize="none"
              autoCorrect={false}
              value={query}
              onChangeText={setQuery}
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('documents.clearSearch')}
              >
                <X size={16} color={colors.navy.muted} />
              </Pressable>
            ) : null}
          </View>

          {types.length > 1 ? (
            <View className="mt-4 flex-row flex-wrap" style={{ gap: 8 }}>
              <ChoiceChip
                label={`${t('documents.filterAll')} · ${total}`}
                selected={typeFilter === 'all'}
                onPress={() => setTypeFilter('all')}
              />
              {types.map(({ type, count }) => (
                <ChoiceChip
                  key={type}
                  label={`${typeLabel(type)} · ${count}`}
                  selected={typeFilter === type}
                  onPress={() => setTypeFilter(type)}
                />
              ))}
            </View>
          ) : null}

          <Text className="mb-3 mt-5 text-[12px] font-bold uppercase tracking-wide text-navy-muted">
            {isNarrowed
              ? t('documents.matchLabel', { count: visible.length })
              : t('documents.countLabel', { count: total })}
          </Text>
        </>
      ) : (
        <View className="mt-6" />
      )}
    </View>
  );

  return (
    <Screen className="px-0">
      {library.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand[500]} size="large" />
          <Text className="mt-3 text-[13px] text-navy-muted">{t('documents.loading')}</Text>
        </View>
      ) : library.isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <CircleAlert size={28} color={colors.semantic.danger} />
          <Text className="mt-3 text-center text-[15px] font-bold text-navy-text">
            {t('documents.errorTitle')}
          </Text>
          <Text className="mt-1.5 text-center text-[13px] leading-5 text-navy-secondary">
            {t('documents.loadError')}
          </Text>
          <Pressable
            onPress={() => library.refetch()}
            accessibilityRole="button"
            className="mt-5 flex-row items-center rounded-full border border-brand-500 px-5 py-2.5"
          >
            <RefreshCw size={14} color={colors.brand[600]} />
            <Text className="ml-2 text-[13px] font-bold text-brand-600">{t('documents.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={library.isRefetching && !library.isFetchingNextPage}
              onRefresh={() => library.refetch()}
              tintColor={colors.brand[500]}
            />
          }
          ListHeaderComponent={header}
          ItemSeparatorComponent={() => <View className="h-3" />}
          ListEmptyComponent={
            documents.length === 0 ? (
              <EmptyState
                icon={FolderOpen}
                title={t('documents.empty')}
                body={t('documents.emptyBody')}
                actionLabel={t('documents.emptyAction')}
                onAction={() => router.push('/export-records')}
              />
            ) : (
              <EmptyState
                icon={Search}
                tone="muted"
                title={t('documents.filterEmptyTitle')}
                body={t('documents.filterEmptyBody')}
                actionLabel={t('documents.clearFilters')}
                onAction={() => {
                  setTypeFilter('all');
                  setQuery('');
                }}
              />
            )
          }
          renderItem={({ item }) => (
            <DocumentCard
              doc={item}
              locale={locale}
              loading={openingId === item.id}
              onView={() => handleView(item)}
            />
          )}
          ListFooterComponent={
            <View>
              {library.hasNextPage ? (
                <Pressable
                  onPress={() => library.fetchNextPage()}
                  disabled={library.isFetchingNextPage}
                  accessibilityRole="button"
                  className="mt-4 flex-row items-center justify-center rounded-2xl bg-white py-3.5"
                  style={CARD_SHADOW}
                >
                  {library.isFetchingNextPage ? (
                    <ActivityIndicator size="small" color={colors.brand[600]} />
                  ) : (
                    <>
                      <Text className="text-[13px] font-bold text-brand-600">
                        {t('documents.loadMore')}
                      </Text>
                      <ChevronDown size={15} color={colors.brand[600]} style={{ marginLeft: 4 }} />
                    </>
                  )}
                </Pressable>
              ) : null}

              {/* The reference's closing privacy block — gold tint, padlock,
                  and a real "Manage Access" route into the privacy hub. */}
              <View className="mt-5 rounded-2xl bg-brand-50 p-4">
                <View className="flex-row items-start">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-100">
                    <Lock size={17} color={colors.brand[600]} />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-[13px] font-bold text-navy-text">
                      {t('documents.privacyBlockTitle')}
                    </Text>
                    <Text className="mt-1 text-[12px] leading-[18px] text-navy-secondary">
                      {t('documents.privacyBlockBody')}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => router.push('/privacy')}
                  accessibilityRole="button"
                  className="mt-3.5 h-11 flex-row items-center justify-center rounded-xl border border-brand-500"
                >
                  <Text className="text-[13px] font-bold text-brand-600">
                    {t('documents.manageAccess')}
                  </Text>
                  <ChevronRight size={15} color={colors.brand[600]} />
                </Pressable>
              </View>

              {documents.length > 0 ? (
                <View className="mt-4">
                  <InlineNotice tone="muted" icon={ShieldCheck} body={t('documents.footerNote')} />
                </View>
              ) : null}
            </View>
          }
        />
      )}
    </Screen>
  );
}

function DocumentCard({
  doc,
  locale,
  loading,
  onView,
}: {
  doc: OfficialDocument;
  locale: string;
  loading: boolean;
  onView: () => void;
}) {
  const { t } = useTranslation();
  const meta = TYPE_META[doc.document_type] ?? { icon: FileText, tone: 'muted' as Tone };
  const Icon = meta.icon;
  const { surface, ink } = toneColors(meta.tone);
  const typeLabel = t(`documents.type.${doc.document_type}`, {
    defaultValue: humanizeSlug(doc.document_type),
  });

  const issued = doc.issued_at ? new Date(doc.issued_at) : null;
  const issuedValid = issued && !Number.isNaN(issued.getTime());

  return (
    <View className="rounded-2xl bg-white p-4" style={CARD_SHADOW}>
      <View className="flex-row items-start">
        {/* Rounded-square tinted tile, colour-coded by type — as drawn in the
            Documents reference. */}
        <View
          className="h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: surface }}
        >
          <Icon size={20} color={ink} />
        </View>
        <View className="ml-3 flex-1 pr-2">
          <Text className="text-[15px] font-extrabold leading-5 text-navy-text" numberOfLines={2}>
            {doc.title}
          </Text>
          {doc.facility_name ? (
            <View className="mt-1 flex-row items-center">
              <Building2 size={11} color={colors.navy.muted} />
              <Text className="ml-1.5 flex-1 text-[12px] text-navy-secondary" numberOfLines={1}>
                {doc.facility_name}
              </Text>
            </View>
          ) : null}
        </View>
        <Chip tone={meta.tone} label={typeLabel} />
      </View>

      {/* Meta line — date and reference. The list endpoint returns no file
          format or size, so neither is shown rather than guessed. */}
      <View className="mt-3 flex-row flex-wrap items-center" style={{ gap: 12 }}>
        {issuedValid ? (
          <View className="flex-row items-center">
            <CalendarClock size={12} color={colors.navy.muted} />
            <Text className="ml-1.5 text-[12px] text-navy-secondary">
              {t('documents.issuedOn', {
                date: issued.toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }),
              })}
            </Text>
          </View>
        ) : null}
        {doc.document_number ? (
          <View className="flex-row items-center">
            <Hash size={12} color={colors.navy.muted} />
            <Text className="ml-1.5 text-[12px] text-navy-secondary" numberOfLines={1}>
              {t('documents.referenceNumber', { number: doc.document_number })}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="mt-3.5 border-t border-cream-200 pt-3.5">
        {doc.verification_code ? (
          <View className="flex-row items-center">
            <BadgeCheck size={13} color={colors.semantic.success} />
            <Text className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-navy-muted">
              {t('documents.verificationCode')}
            </Text>
          </View>
        ) : null}
        {doc.verification_code ? (
          <Text
            className="mt-1 text-[12px] font-semibold text-navy-text"
            style={{ letterSpacing: 0.5 }}
            numberOfLines={1}
          >
            {doc.verification_code}
          </Text>
        ) : null}

        <Pressable
          onPress={onView}
          disabled={loading}
          accessibilityRole="button"
          className="mt-3 h-12 flex-row items-center justify-center rounded-xl bg-brand-500"
          style={{ opacity: loading ? 0.7 : 1 }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Text className="mr-2 text-[13px] font-bold text-white">{t('documents.view')}</Text>
              <ExternalLink size={14} color={colors.white} />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}
