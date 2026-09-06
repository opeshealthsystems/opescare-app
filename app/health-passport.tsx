/**
 * My Health Passport — the patient's record, read as thirty pages.
 *
 * The Health ID says who you are. The Passport organises what is known about
 * your health, in the canonical order of the printed document, so a life of
 * care can be leafed through rather than hunted for across separate screens.
 *
 * WHAT THIS SCREEN PROMISES
 *
 *  1. IT NEVER INVENTS. Every line comes from the server, built from records
 *     this patient actually has. A page with nothing behind it says so, in as
 *     many words. The imported package shipped specimen pages for design
 *     review; none of that content reaches a real reader, because a passport
 *     that fills its gaps with plausible prose is worse than no passport — a
 *     clinician reading "no known allergies" has to be able to trust that
 *     somebody checked.
 *
 *  2. IT IS NOT A CREDENTIAL. The artwork is anti-copy language, not proof.
 *     Presenting identity is still the Health ID card and its short-lived QR;
 *     this screen links there rather than pretending to be it.
 *
 *  3. IT FOLLOWS THE SWITCH. Behind `auth.mobile`, so a guardian acting for a
 *     dependent reads the dependent's passport, with the same rules as every
 *     other record screen.
 *
 * Phone-first per the package's visual spec: one column, safe areas, ~46pt
 * targets, bottom page controls and a page-index sheet, no desktop shell and
 * no A4 spread.
 */
import { useCallback, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  PulseLogo,
  ScreenHeader,
  spacing,
  typography,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, describeFailure } from '@/components/care/shared';
import { PassportPageBody } from '@/components/passport/PassportPage';
import { passportIcon } from '@/components/passport/assets';
import { FootBand, HolderStrip, PageKicker, PassportRail } from '@/components/passport/PageFurniture';
import { SecurityFooter } from '@/components/passport/SecurityFooter';
import { SecuritySubstrate } from '@/components/passport/substrate';
import { passportColors as c, passportRadius as r } from '@/components/passport/tokens';
import {
  isPassportUnserved,
  pageIsEmpty,
  usePassportPage,
  usePassportSummary,
} from '@/lib/api/passportQueries';

export default function HealthPassportScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const summary = usePassportSummary();
  const pages = summary.data?.pages ?? [];
  const total = summary.data?.total_pages ?? pages.length;

  const [index, setIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  const current = pages[index];
  const page = usePassportPage(current?.id ?? null, { enabled: !!current });
  // The covers are the document's face and are drawn edge to edge.
  const isCover = page.data?.kind === 'cover' || page.data?.kind === 'back-cover';

  const go = useCallback(
    (next: number) => {
      if (pages.length === 0) return;
      setIndex(Math.min(pages.length - 1, Math.max(0, next)));
    },
    [pages.length]
  );

  const stateLabel = useMemo(() => {
    if (page.isFetching) return t('passport.loadingShort');
    if (page.isError) return t('passport.errorShort');
    return t('passport.current');
  }, [page.isFetching, page.isError, t]);

  // The passport index itself could not be read: say which failure it was.
  if (summary.isPending) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('passport.title')} subtitle={t('passport.subtitle')} />
        <LoadingBlock label={t('passport.loading')} />
      </SafeAreaView>
    );
  }

  if (summary.isError || pages.length === 0) {
    const unserved = isPassportUnserved(summary.error);
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('passport.title')} subtitle={t('passport.subtitle')} />
        <Card variant="flush">
          <EmptyState
            icon="alert-circle"
            tint="amber"
            title={unserved ? t('passport.notServedTitle') : t('passport.errorTitle')}
            message={unserved ? t('passport.notServedBody') : describeFailure(summary.error).message}
            actionLabel={t('passport.tryAgain')}
            onAction={() => void summary.refetch()}
          />
        </Card>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title={t('passport.title')}
        subtitle={summary.data?.health_id ?? t('passport.subtitle')}
        actions={[
          {
            icon: 'grid',
            accessibilityLabel: t('passport.pagesLabel'),
            onPress: () => setSheetOpen(true),
          },
        ]}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.canvas, isCover && styles.canvasCover]}>
          {isCover ? null : <SecuritySubstrate />}
          {isCover ? null : <PassportRail />}

          {isCover ? null : (
            <View style={styles.masthead}>
              <View style={styles.mastLeft}>
                <View style={styles.mastLogo}>
                  <PulseLogo size={16} />
                </View>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.mastBrand} numberOfLines={1}>
                    Opes<Text style={styles.mastBrandAccent}>Care</Text>
                  </Text>
                  <Text style={styles.mastBrandSub} numberOfLines={1}>
                    {t('passport.mastheadSub')}
                  </Text>
                </View>
              </View>
              <View style={styles.mastRight}>
                <Text style={styles.mastTitle} numberOfLines={1}>
                  {t('passport.documentLabel')}
                </Text>
                <Text style={styles.mastPage}>
                  {t('passport.pageWord')} {String(current?.number ?? 1).padStart(2, '0')}/{total}
                </Text>
              </View>
            </View>
          )}
          {isCover ? null : (
            <Text style={styles.taglineStrip} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {t('passport.tagline')}
            </Text>
          )}

          {/* The demo pill the package's shell carries — shown ONLY when the
              account really is a demonstration one. On a real record it would
              be a lie in the other direction. */}
          {summary.data?.is_demo && !isCover ? (
            <View style={styles.demoPill}>
              <Icon name="info" size={12} color={c.warning} />
              <Text style={styles.demoText}>{t('passport.demoPill')}</Text>
            </View>
          ) : null}

          {isCover ? null : <View style={styles.rule} />}

          {isCover ? null : <View style={styles.titleRow}>
            <View style={styles.pageChip}>
              <Text style={styles.pageChipText}>{String(current?.number ?? 1).padStart(2, '0')}</Text>
            </View>
            <View style={styles.titleIcon}>
              {/* The page's own mark, drawn for these thirty pages. */}
              <Image
                source={passportIcon(current?.id)}
                style={styles.titleGlyph}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pageTitle}>{current?.title}</Text>
              {current?.subtitle ? <PageKicker text={current.subtitle} /> : null}
            </View>
          </View>}

          {isCover ? null : (
            <HolderStrip
              name={summary.data?.display_name}
              healthId={summary.data?.health_id}
              dateOfBirth={summary.data?.date_of_birth}
              sex={summary.data?.sex}
            />
          )}

          {page.isPending ? (
            <View style={styles.centre}>
              <LoadingBlock label={t('passport.loading')} />
            </View>
          ) : page.isError ? (
            <View style={styles.centre}>
              <Icon name="alert-circle" size={30} color={c.danger} />
              <Text style={styles.stateText}>
                {isPassportUnserved(page.error) ? t('passport.notServedBody') : t('passport.error')}
              </Text>
              <Pressable onPress={() => void page.refetch()} style={styles.retry} accessibilityRole="button">
                <Text style={styles.retryText}>{t('passport.tryAgain')}</Text>
              </Pressable>
            </View>
          ) : pageIsEmpty(page.data) && page.data?.id !== 'verification' ? (
            <View style={styles.centre}>
              <Icon name="folder" size={30} color={c.muted} />
              <Text style={styles.stateText}>{t('passport.empty')}</Text>
              <Text style={styles.stateHint}>{t('passport.emptyHint')}</Text>
            </View>
          ) : page.data ? (
            <PassportPageBody
              page={page.data}
              status={summary.data?.status ?? 'PROVISIONAL'}
              holderName={summary.data?.display_name}
              healthId={summary.data?.health_id}
            />
          ) : null}

          {isCover ? null : <SecurityFooter
            status={summary.data?.status ?? 'PROVISIONAL'}
            healthId={summary.data?.health_id}
            lastUpdatedAt={summary.data?.last_updated_at}
            pageNumber={current?.number ?? 1}
            totalPages={total}
          />}

          {isCover ? null : <FootBand />}
        </View>

        {/* The passport reads the record; presenting identity is the card. */}
        <View style={styles.presentRow}>
          <CareButton
            label={t('passport.openCard')}
            icon="id-card"
            variant="secondary"
            onPress={() => router.push('/health-id')}
          />
        </View>
      </ScrollView>

      <View style={styles.bottomNav}>
        <Pressable
          disabled={index === 0}
          onPress={() => go(index - 1)}
          style={[styles.navBtn, index === 0 && styles.navDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t('passport.previous')}
        >
          <Icon name="chevron-left" size={18} color={index === 0 ? c.muted : c.primary} />
          <Text style={styles.navText}>{t('passport.previous')}</Text>
        </Pressable>

        <Text style={styles.position}>
          {(current?.number ?? 1)} / {total}
        </Text>

        <Pressable
          disabled={index >= pages.length - 1}
          onPress={() => go(index + 1)}
          style={[styles.navBtn, index >= pages.length - 1 && styles.navDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t('passport.next')}
        >
          <Text style={styles.navText}>{t('passport.next')}</Text>
          <Icon name="chevron-right" size={18} color={index >= pages.length - 1 ? c.muted : c.primary} />
        </Pressable>
      </View>

      <Modal visible={sheetOpen} animationType="slide" transparent onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{t('passport.title')}</Text>
              <Pressable onPress={() => setSheetOpen(false)} style={styles.close} accessibilityRole="button" accessibilityLabel={t('passport.close')}>
                <Icon name="close" size={18} color={c.primary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {pages.map((p, i) => (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    setIndex(i);
                    setSheetOpen(false);
                  }}
                  style={[styles.indexRow, i === index && styles.indexActive]}
                  accessibilityRole="button"
                >
                  <View style={styles.num}>
                    <Image
                      source={passportIcon(p.id)}
                      style={styles.rowGlyph}
                      resizeMode="contain"
                      accessibilityIgnoresInvertColors
                    />
                  </View>
                  <Text style={styles.rowNum}>{p.number}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{p.title}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {p.subtitle}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={15} color={c.muted} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  scroll: { padding: 12, paddingBottom: 24 },
  // A cover is the face: no paper, no border, no padding around it.
  canvasCover: { backgroundColor: 'transparent', borderWidth: 0, padding: 0, minHeight: 0, overflow: 'visible' },
  canvas: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: c.surface,
    borderRadius: r.xl,
    borderWidth: 1,
    borderColor: c.border,
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 24, // clears the bound edge
    paddingRight: 16,
    minHeight: 600,
  },
  topMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  docLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: c.primaryDark },
  microLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 1.1, color: c.teal },
  pageBadge: {
    minWidth: 48, borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 5, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.82)',
  },
  pageSmall: { fontSize: 7, fontWeight: '900', letterSpacing: 1, color: c.muted },
  pageBig: { fontSize: 15, fontWeight: '900', color: c.primary },
  pageSlash: { fontSize: 9, fontWeight: '700', color: c.muted },
  demoPill: {
    alignSelf: 'flex-start', marginTop: 13, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#FFF7E8', borderWidth: 1, borderColor: '#F2D59F',
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  demoText: { fontSize: 8.5, fontWeight: '900', letterSpacing: 0.4, color: c.warning },
  rule: { height: 1, backgroundColor: c.border, marginVertical: 15 },
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  titleIcon: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: c.primaryLight,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D5E7F3',
  },
  pageTitle: { fontSize: 22, fontWeight: '900', color: c.text, lineHeight: 28 },
  pageSubtitle: { marginTop: 3, fontSize: 12, color: c.textSecondary, lineHeight: 17 },
  centre: { paddingVertical: 56, alignItems: 'center', gap: 10 },
  stateText: { fontSize: 13, color: c.textSecondary, textAlign: 'center', maxWidth: 280, lineHeight: 19 },
  stateHint: { fontSize: 11, color: c.muted, textAlign: 'center', maxWidth: 280, lineHeight: 16 },
  retry: { marginTop: 6, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, backgroundColor: c.primary },
  retryText: { color: c.surface, fontWeight: '800' },
  footer: {
    marginTop: 22, paddingTop: 13, borderTopWidth: 1, borderTopColor: c.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  secure: { fontSize: 11, fontWeight: '900', color: c.primary },
  footerMeta: { fontSize: 7, color: c.muted, marginTop: 3, letterSpacing: 0.7 },
  footerMicro: { fontSize: 7, fontWeight: '900', color: c.primary },
  presentRow: { marginTop: spacing.md },
  bottomNav: {
    height: 66, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: c.border,
    backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  navBtn: {
    minWidth: 104, minHeight: 46, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1,
    borderColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  navDisabled: { opacity: 0.45 },
  navText: { fontSize: 12, fontWeight: '800', color: c.primary },
  position: { fontSize: 12, fontWeight: '900', color: c.textSecondary },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2,20,34,0.35)' },
  sheet: { maxHeight: '88%', backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
  sheetHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: c.text },
  close: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  indexRow: {
    paddingVertical: 11, paddingHorizontal: 8, flexDirection: 'row', gap: 10, alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: c.border, borderRadius: 12, minHeight: 46,
  },
  indexActive: { backgroundColor: c.primaryLight },
  num: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDF4F9' },
  numText: { fontSize: 11, fontWeight: '900', color: c.primary },
  titleGlyph: { width: 24, height: 24 },
  masthead: {
    marginLeft: -24, marginRight: -16, marginTop: -16, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: c.primaryDark, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  },
  mastLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  mastLogo: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  mastBrand: { fontSize: 13, fontWeight: '900', color: '#FFFFFF' },
  mastBrandAccent: { color: '#7FD8E8' },
  mastBrandSub: { fontSize: 6, fontWeight: '800', letterSpacing: 1.1, color: 'rgba(255,255,255,0.7)' },
  mastRight: { alignItems: 'flex-end' },
  mastTitle: { fontSize: 9.5, fontWeight: '900', letterSpacing: 1.1, color: '#FFFFFF' },
  mastPage: { fontSize: 8, fontWeight: '800', letterSpacing: 1, color: '#9FD4EA', marginTop: 2 },
  taglineStrip: {
    marginLeft: -24, marginRight: -16, paddingVertical: 4, backgroundColor: c.primaryLight,
    fontSize: 7.5, fontWeight: '800', letterSpacing: 1.2, color: c.primary, textAlign: 'center',
  },
  pageChip: {
    minWidth: 34, height: 34, borderRadius: 9, backgroundColor: c.primary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  pageChipText: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },
  rowGlyph: { width: 20, height: 20 },
  rowNum: { width: 20, fontSize: 10, fontWeight: '900', color: c.muted, textAlign: 'center' },
  rowTitle: { fontSize: 12.5, fontWeight: '800', color: c.text },
  rowSub: { fontSize: 10.5, color: c.textSecondary, marginTop: 2 },
});

// `typography` is imported for the design-system contract even where the
// passport's own type scale governs; referenced here to keep the import honest.
void typography;
