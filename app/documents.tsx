/**
 * Documents — the official, independently verifiable papers a facility has
 * issued to the patient (discharge summaries, lab reports, certificates,
 * vaccination cards…). Library + preview panel on one route.
 *
 * Presentation follows the OPES kit: the library is a flush card of `ListRow`s
 * (type-tinted circle, title, facility • issue date, type badge) behind a
 * search field and counted filter chips; tapping a row opens the DOC-002
 * preview panel — hero with the verified/pending pill, the file sheet, a
 * details card and an actions card — in place of the list.
 *
 * Every action reaches the real API. "Open & verify" fetches the document's
 * detail at tap time because the backend mints a fresh, short-lived
 * `verify_url` per view; a `null` URL (no file attached) is reported, never
 * opened. "Share" mints the same link through `components/docs/shared`. The
 * list endpoint returns no file size or format, so neither is shown rather
 * than guessed. There is no mobile upload endpoint, so there is no upload
 * affordance. GET /mobile/documents is empty for most patients, so the empty
 * state reads as "nothing has been issued yet" with a real next step.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Linking from 'expo-linking';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  ListRow,
  PillInput,
  ResultList,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type Tint,
} from '@/components/opes-ui';
import { AsyncBoundary, CareButton, InfoRow, NoticeBanner } from '@/components/care/shared';
import { DocumentUnavailableError, asyncStateOf, fmtDocDate, shareDocumentLink } from '@/components/docs/shared';
import { useIsOnline } from '@/lib/offline';
import { useDocumentViewer } from '@/lib/api/queries';
import { useDocumentLibrary } from '@/lib/api/privacyQueries';
import type { OfficialDocument, OfficialDocumentDetail } from '@/lib/api/types';

/** Icon + tint per document type — §1: labs/meds green, documents blue, referrals purple. */
const TYPE_META: Record<string, { icon: IconName; tint: Tint }> = {
  discharge_summary: { icon: 'document-text', tint: 'blue' },
  lab_report: { icon: 'flask', tint: 'green' },
  referral_letter: { icon: 'send', tint: 'purple' },
  vaccination_card: { icon: 'syringe', tint: 'green' },
  medical_certificate: { icon: 'check-circle', tint: 'blue' },
  prescription: { icon: 'pill', tint: 'green' },
  invoice: { icon: 'receipt', tint: 'amber' },
  // Rendered from the record on request rather than issued and stored.
  laboratory_report: { icon: 'flask', tint: 'green' },
  immunisation_record: { icon: 'syringe', tint: 'green' },
  certificate: { icon: 'check-circle', tint: 'blue' },
  RX: { icon: 'pill', tint: 'green' },
  MC: { icon: 'check-circle', tint: 'blue' },
  ICV: { icon: 'syringe', tint: 'green' },
};
const DEFAULT_META: { icon: IconName; tint: Tint } = { icon: 'document', tint: 'blue' };

type NoticeTone = 'pending' | 'warning' | 'critical' | 'normal';
type Notice = { tone: NoticeTone; message: string };

export default function DocumentsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const online = useIsOnline();

  const library = useDocumentLibrary();
  const viewer = useDocumentViewer();

  const [selected, setSelected] = useState<OfficialDocument | null>(null);
  const [detail, setDetail] = useState<OfficialDocumentDetail | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<'open' | 'share' | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const documents = library.data?.documents ?? [];
  const total = library.data?.total ?? 0;

  const typeLabel = (type: string) =>
    t(`documents.type.${type}`, { defaultValue: t('documents.type.other') });

  /** Distinct types present, with their counts — only offered once there is
   * genuinely something to narrow down. */
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
        .filter((field): field is string => !!field)
        .some((field) => field.toLowerCase().includes(needle));
    });
  }, [documents, typeFilter, query]);

  const isNarrowed = typeFilter !== 'all' || query.trim().length > 0;

  const state = asyncStateOf(library, {
    offline: !online,
    offlineMessage: t('opesCore.errors.offlineBody'),
  });

  const openPreview = (doc: OfficialDocument) => {
    setSelected(doc);
    setDetail(null);
    setNotice(null);
  };
  const closePreview = () => {
    setSelected(null);
    setNotice(null);
  };

  /**
   * Documents the server renders on request carry their own signed link, so
   * there is nothing to fetch first — the sheet is built when the link is
   * opened. It goes to the system browser because that is what can save a file.
   */
  const handleDownload = async (doc: OfficialDocument) => {
    setNotice(null);
    if (!doc.download_url) {
      setNotice({ tone: 'critical', message: t('documents.viewError') });
      return;
    }
    try {
      await Linking.openURL(doc.download_url);
    } catch {
      setNotice({ tone: 'critical', message: t('documents.viewError') });
    }
  };

  const handleOpen = (doc: OfficialDocument) => {
    setNotice(null);
    setBusy('open');
    // The backend mints a fresh, short-lived verify_url per view, so the URL is
    // fetched at tap time rather than cached with the list.
    viewer.mutate(doc.id, {
      onSuccess: async (d) => {
        setBusy(null);
        setDetail(d);
        if (!d.verify_url) {
          setNotice({ tone: 'critical', message: t('documents.noVerifyUrl') });
          return;
        }
        try {
          await Linking.openURL(d.verify_url);
        } catch {
          setNotice({ tone: 'critical', message: t('documents.viewError') });
        }
      },
      onError: () => {
        setBusy(null);
        setNotice({ tone: 'critical', message: t('documents.viewError') });
      },
    });
  };

  const handleShare = async (doc: OfficialDocument) => {
    setNotice(null);
    setBusy('share');
    try {
      await shareDocumentLink(doc.id, doc.title);
    } catch (e) {
      setNotice({
        tone: 'critical',
        message: e instanceof DocumentUnavailableError ? e.message : t('documents.viewError'),
      });
    } finally {
      setBusy(null);
    }
  };

  // ── Preview panel ─────────────────────────────────────────────────────────
  if (selected) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        <ScreenHeader
          title={t('opesDocs.preview.title')}
          align="center"
          onBack={closePreview}
          actions={[{ icon: 'lock', onPress: () => router.push('/privacy'), accessibilityLabel: t('documents.manageAccess') }]}
        />
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <PreviewPanel
            doc={selected}
            detail={detail}
            notice={notice}
            busy={busy}
            typeLabel={typeLabel(selected.document_type)}
            onOpen={() => handleOpen(selected)}
            onDownload={() => void handleDownload(selected)}
            onShare={() => void handleShare(selected)}
            onManageAccess={() => router.push('/privacy')}
            onBack={closePreview}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Library ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('documents.title')}
        subtitle={t('documents.subtitle')}
        actions={[{ icon: 'lock', onPress: () => router.push('/privacy'), accessibilityLabel: t('documents.manageAccess') }]}
      />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={library.isRefetching && !library.isFetchingNextPage}
            onRefresh={() => library.refetch()}
            tintColor={colors.blue}
          />
        }
      >
        <NoticeBanner icon="shield-check" tone="normal" title={t('documents.verifiedTitle')} message={t('documents.verifiedBody')} />
        {notice ? <NoticeBanner icon="alert-circle" tone={notice.tone} message={notice.message} /> : null}

        <AsyncBoundary
          state={state}
          loadingLabel={t('documents.loading')}
          isEmpty={(lib) => lib.documents.length === 0}
          empty={
            <>
              <Card>
                <EmptyState
                  icon="folder"
                  tint="blue"
                  title={t('documents.empty')}
                  message={t('documents.emptyBody')}
                  actionLabel={t('documents.emptyAction')}
                  onAction={() => router.push('/export-records')}
                />
              </Card>
              <PrivacyBlock onManageAccess={() => router.push('/privacy')} />
            </>
          }
        >
          {() => (
            <>
              <PillInput
                icon={<Icon name="search" size={18} color={colors.textMuted} />}
                placeholder={t('documents.searchPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel={t('documents.searchPlaceholder')}
              />

              {types.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
                  <Chip
                    label={t('documents.filterAll')}
                    count={total}
                    selected={typeFilter === 'all'}
                    onPress={() => setTypeFilter('all')}
                  />
                  {types.map(({ type, count }) => (
                    <Chip
                      key={type}
                      label={typeLabel(type)}
                      count={count}
                      selected={typeFilter === type}
                      onPress={() => setTypeFilter(type)}
                    />
                  ))}
                </ScrollView>
              ) : null}

              <SectionHeader
                variant="overline"
                title={isNarrowed ? t('documents.matchLabel', { count: visible.length }) : t('documents.countLabel', { count: total })}
                style={s.listHeader}
              />

              {visible.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="search"
                    tint="blue"
                    title={t('documents.filterEmptyTitle')}
                    message={t('documents.filterEmptyBody')}
                    actionLabel={t('documents.clearFilters')}
                    onAction={() => {
                      setTypeFilter('all');
                      setQuery('');
                    }}
                  />
                </Card>
              ) : (
                <ResultList>
                  {visible.map((doc) => {
                    const meta = TYPE_META[doc.document_type] ?? DEFAULT_META;
                    return (
                      <Card key={doc.id} variant="flush">
                        <ListRow
                          icon={meta.icon}
                          tint={meta.tint}
                          title={doc.title}
                          meta={[doc.facility_name, doc.issued_at ? fmtDocDate(doc.issued_at) : null]}
                          trailing={<StatusBadge status={doc.document_type} tone="neutral" label={typeLabel(doc.document_type)} size="sm" />}
                          onPress={() => openPreview(doc)}
                          accessibilityHint={t('documents.view')}
                          divider={false}
                        />
                      </Card>
                    );
                  })}
                </ResultList>
              )}

              {library.hasNextPage ? (
                <CareButton
                  variant="secondary"
                  label={t('documents.loadMore')}
                  iconRight="chevron-down"
                  loading={library.isFetchingNextPage}
                  onPress={() => void library.fetchNextPage()}
                />
              ) : null}

              <PrivacyBlock onManageAccess={() => router.push('/privacy')} />
              <NoticeBanner icon="shield-check" tone="pending" message={t('documents.footerNote')} />
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ preview */

function PreviewPanel({
  doc,
  detail,
  notice,
  busy,
  typeLabel,
  onOpen,
  onShare,
  onDownload,
  onManageAccess,
  onBack,
}: {
  doc: OfficialDocument;
  detail: OfficialDocumentDetail | null;
  notice: Notice | null;
  busy: 'open' | 'share' | null;
  typeLabel: string;
  onOpen: () => void;
  onShare: () => void;
  onDownload: () => void;
  onManageAccess: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { colors, statusMap, tintMap } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  // A verification code is what makes the paper independently checkable.
  const verified = !!doc.verification_code;
  const issued = doc.issued_at ? fmtDocDate(doc.issued_at) : '';
  const meta = TYPE_META[doc.document_type] ?? DEFAULT_META;
  const tint = tintMap[meta.tint];

  return (
    <>
      {/* Hero */}
      <View style={s.hero}>
        <View style={[s.heroIcon, { backgroundColor: tint.bg }]}>
          <Icon name={meta.icon} size={28} color={tint.fg} />
        </View>
        <View style={s.heroBody}>
          {/* The document title is the facility's — never translated. */}
          <Text style={s.heroTitle} numberOfLines={2}>
            {doc.title}
          </Text>
          <Text style={s.heroMeta}>
            {issued ? t('documents.issuedOn', { date: issued }) : t('opesCore.common.notRecorded')}
          </Text>
          {doc.facility_name ? (
            <View style={s.heroPlace}>
              <Icon name="location" size={14} color={colors.link} />
              <Text style={s.heroPlaceText} numberOfLines={1}>
                {doc.facility_name}
              </Text>
            </View>
          ) : null}
        </View>
        {/* A document the server renders on request is not awaiting anything:
            its verification is minted at the moment it is downloaded, so
            "pending" would be a status invented for it. */}
        {doc.download_url ? (
          <StatusBadge
            status="on_demand"
            tone="normal"
            icon="refresh"
            label={t('documents.onDemandBadge')}
          />
        ) : (
          <StatusBadge
            status={verified ? 'verified' : 'pending'}
            tone={verified ? 'normal' : 'warning'}
            icon={verified ? 'check-circle' : 'alert-circle'}
            label={verified ? t('opesDocs.preview.verified') : t('opesDocs.preview.pending')}
          />
        )}
      </View>

      {notice ? <NoticeBanner icon="alert-circle" tone={notice.tone} message={notice.message} /> : null}

      {/* File sheet */}
      <Card>
        <View style={s.previewRow}>
          <View style={s.sheet}>
            <Icon name="document-text" size={34} color={colors.blue} />
            <Text style={s.sheetCaption} numberOfLines={2}>
              {doc.document_number ?? typeLabel}
            </Text>
          </View>
          <View style={s.previewBody}>
            <View style={s.previewHead}>
              <View style={[s.fileIcon, { backgroundColor: statusMap.critical.bg }]}>
                <Icon name="document-text" size={20} color={statusMap.critical.fg} />
              </View>
              <View style={s.previewNameBox}>
                <Text style={s.previewName} numberOfLines={2}>
                  {doc.title}
                </Text>
                <Text style={s.previewMeta} numberOfLines={1}>
                  {typeLabel}
                </Text>
              </View>
            </View>
            <Text style={s.previewDesc}>
              {doc.download_url ? t('documents.onDemandDesc') : t('opesDocs.preview.documentDesc')}
            </Text>
            <View style={s.chip}>
              <Icon name="shield-check" size={16} color={colors.link} />
              <Text style={s.chipText}>
                {doc.download_url
                  ? t('documents.onDemandChip')
                  : verified
                    ? t('opesDocs.preview.verifiedDocument')
                    : t('opesDocs.preview.awaitingVerification')}
              </Text>
            </View>
          </View>
        </View>
      </Card>

      {/* Details */}
      <Card variant="flush">
        <View style={s.rows}>
          <InfoRow
            icon="building"
            tint="blue"
            label={t('opesDocs.detail.facility', { defaultValue: 'Issuing facility' })}
            value={doc.facility_name ?? t('opesCore.common.notRecorded')}
            divider
          />
          <InfoRow
            icon="calendar"
            tint="blue"
            label={t('opesDocs.detail.issued', { defaultValue: 'Issued' })}
            value={issued || t('opesCore.common.notRecorded')}
            divider={!!doc.document_number || !!doc.verification_code || !!detail?.expires_at}
          />
          {doc.document_number ? (
            <InfoRow
              icon="document"
              tint="blue"
              label={t('opesDocs.detail.reference', { defaultValue: 'Reference number' })}
              value={doc.document_number}
              divider={!!doc.verification_code || !!detail?.expires_at}
            />
          ) : null}
          {doc.verification_code ? (
            <InfoRow
              icon="shield-check"
              tint="green"
              label={t('documents.verificationCode')}
              value={doc.verification_code}
              divider={!!detail?.expires_at}
            />
          ) : null}
          {detail?.expires_at ? (
            <InfoRow
              icon="clock"
              tint="amber"
              label={t('opesDocs.detail.expires', { defaultValue: 'Valid until' })}
              value={fmtDocDate(detail.expires_at)}
            />
          ) : null}
        </View>
      </Card>

      {/* Actions */}
      <Card variant="flush">
        {doc.download_url ? (
          <ListRow
            icon="download"
            tint="green"
            title={t('documents.download')}
            subtitle={t('documents.downloadSub')}
            onPress={onDownload}
            chevron
          />
        ) : null}
        {doc.download_url ? null : <ListRow
          icon="external-link"
          tint="blue"
          title={t('documents.view')}
          subtitle={t('opesDocs.preview.openSub', { defaultValue: 'Opens the sealed original with its verification link' })}
          onPress={busy ? undefined : onOpen}
          chevron={busy !== 'open'}
          trailing={busy === 'open' ? <ActivityIndicator size="small" color={colors.blue} /> : undefined}
          divider
        />}
        {doc.download_url ? null : <ListRow
          icon="share"
          tint="blue"
          title={t('opesDocs.preview.shareTitle')}
          subtitle={t('opesDocs.preview.shareSub')}
          onPress={busy ? undefined : onShare}
          chevron={busy !== 'share'}
          trailing={busy === 'share' ? <ActivityIndicator size="small" color={colors.blue} /> : undefined}
          divider
        />}
        <ListRow
          icon="lock"
          tint="purple"
          title={t('documents.manageAccess')}
          subtitle={t('documents.privacyBlockBody')}
          onPress={onManageAccess}
        />
      </Card>

      <NoticeBanner icon="shield-check" tone="pending" message={t('documents.footerNote')} />

      <CareButton
        variant="secondary"
        icon="chevron-left"
        label={t('opesDocs.preview.backToLibrary', { defaultValue: 'Back to documents' })}
        onPress={onBack}
      />
    </>
  );
}

/* ------------------------------------------------------------------ privacy */

/** The reference's closing privacy block, with a real "Manage access" route. */
function PrivacyBlock({ onManageAccess }: { onManageAccess: () => void }) {
  const { t } = useTranslation();
  const { colors, tintMap } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card>
      <View style={s.privacyRow}>
        <View style={[s.privacyMark, { backgroundColor: tintMap.blue.bg }]}>
          <Icon name="lock" size={20} color={tintMap.blue.fg} />
        </View>
        <View style={s.privacyBody}>
          <Text style={s.privacyTitle}>{t('documents.privacyBlockTitle')}</Text>
          <Text style={s.privacyText}>{t('documents.privacyBlockBody')}</Text>
        </View>
      </View>
      <CareButton variant="secondary" label={t('documents.manageAccess')} iconRight="chevron-right" onPress={onManageAccess} style={s.privacyButton} />
    </Card>
  );
}

/* ------------------------------------------------------------------ styles */

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
    chips: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.md },
    listHeader: { marginBottom: 0 },

    hero: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 4 },
    heroIcon: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroBody: { flex: 1, minWidth: 0, gap: 3 },
    heroTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.lg, color: colors.textPrimary },
    heroMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },
    heroPlace: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    heroPlaceText: { flex: 1, fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.link },

    previewRow: { flexDirection: 'row', gap: spacing.md - 4 },
    sheet: {
      width: 96,
      height: 136,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: spacing.sm,
    },
    sheetCaption: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 10,
      textAlign: 'center',
      color: colors.textMuted,
    },
    previewBody: { flex: 1, minWidth: 0, gap: spacing.sm },
    previewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    fileIcon: {
      width: 40,
      height: 40,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewNameBox: { flex: 1, minWidth: 0, gap: 2 },
    previewName: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },
    previewMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },
    previewDesc: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    chip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.pill,
      backgroundColor: colors.primarySoft,
    },
    chipText: { flexShrink: 1, fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.link },

    // InfoRow carries no horizontal inset of its own — it expects a padded card.
    rows: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },

    privacyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 4 },
    privacyMark: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    privacyBody: { flex: 1, minWidth: 0, gap: 3 },
    privacyTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
    privacyText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    privacyButton: { marginTop: spacing.md },
  });
