import { PaperWave } from '@/components/ui/PaperWave';
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Icon, PulseLogo, Wordmark } from '@/components/opes-ui';
import { QuickAction } from '@/components/blood/finder/parts';
import { useBloodFinder } from '@/components/blood/finder/useBloodFinder';
import { FinderCard, TrustAndEmergency, ResultsSection, MyRequestsSection } from '@/components/blood/finder/sections';

/**
 * Blood Finder — pick a blood group + component, see which facilities near the
 * chosen origin report units as available, then request (reserve) some.
 *
 * Presentation: the OPES kit (`ScreenHeader` → group/component/where `Chip`s →
 * `PillInput` filter → results as `Card variant="flush"` + `ListRow`s with the
 * spec's RED tint circle (§1: red = critical / blood) → the embedded
 * `FacilityMap` → `EmptyState` recoveries → safety strip), in the app's own
 * `opescare` palette, read from `useTheme()`. There is no OPES source screen
 * for blood, so the layout follows the finder archetype the kit already has:
 * `app/pharmacy.tsx` (search + filters + nearby facilities + map + reserve) and
 * `app/care-map.tsx` (facility list + map + device location).
 *
 * The data layer is untouched: `useBloodOptions`, `useBloodSearch`,
 * `useNationwideBloodSearch`, `useBloodRequests`, `useCancelBloodRequest`.
 *
 * This screen is used by someone who is frightened and in a hurry, so it stays
 * laid out as three numbered steps in the order a person actually thinks:
 * *what group*, *what component*, *where*.
 *
 * ── Why the badge is freshness, not "Available" ─────────────────────────────
 * MobileBloodController::search() runs through
 * BloodAvailability::scopeAvailable(), so `availability.status` is 'available'
 * on EVERY row it can ever return. A green "Available" pill on every card is
 * therefore decoration that reads as certainty, and this is the one screen
 * where false certainty costs the most. The trailing badge carries
 * `availability.freshness` instead — the field that actually varies (the
 * projector stamps fresh ≤2 h, recent ≤6 h, stale beyond) — and every card
 * prints `last_updated_at` in full. The status word is still shown, worded as
 * the report it is ("Reported available"), never as a fact.
 *
 * ── On empty results ────────────────────────────────────────────────────────
 * `blood_availability` is facility-self-reported and, behind
 * `scopeReportedByRealSource()`, frequently empty, so "no results" is the
 * NORMAL outcome, not an edge case. It is therefore built as a first-class
 * screen state with real, working next steps — widen the radius, search the
 * whole country (a supported origin-less query), switch to a clinically
 * compatible group that *does* have reported stock, fall back to whole blood,
 * or go find a hospital to phone. Nothing here is faked: every number on this
 * screen came from the API.
 *
 * ── Two actions per bank, on purpose ────────────────────────────────────────
 * Unlike the pharmacy list (one row → one detail screen), each bank keeps both
 * "Call" and "Request units" on the list itself. The safety notice tells every
 * patient to phone before travelling; burying the number one screen deeper
 * would cost a tap at the worst possible moment.
 */

export default function BloodFinderScreen() {
  const vm = useBloodFinder();
  const {
    t,
    router,
    colors,
    styles,
    dialog,
    refreshing,
    scrollRef,
    goBack,
    onRefresh,
    headerActions,
  } = vm;

  return (
    <Screen className="px-0">
      <PaperWave />
      {/*
        The reference's top bar is the BRAND lockup, not a screen title — which
        is precisely why its hero below is free to carry the name at full size.
        Reproducing that here means the title is printed once, in the place the
        design puts it, instead of twice.

        `accessibilityLabel` on the bar keeps the screen announceable, which is
        the one thing ScreenHeader's title was buying.
      */}
      <View
        style={styles.topBar}
        accessibilityRole="header"
        accessibilityLabel={t('bloodFinder.title')}
      >
        <TouchableOpacity
          onPress={goBack}
          hitSlop={10}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
          style={styles.topBarBack}
        >
          <Icon name="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.topBarBrand}>
          <PulseLogo size={34} />
          <Wordmark size="md" showTagline />
        </View>

        <View style={styles.topBarActions}>
          {headerActions.map((action) => (
            <TouchableOpacity
              key={action.accessibilityLabel}
              onPress={action.onPress}
              hitSlop={8}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
              style={styles.topBarAction}
            >
              <Icon name={action.icon} size={20} color={colors.textPrimary} />
              {action.badge ? (
                <View style={[styles.topBarBadge, { backgroundColor: colors.blue }]}>
                  <Text style={styles.topBarBadgeText}>{action.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />
        }
      >
        {/* Hero (PM-BLOOD-01) --------------------------------------------
            Droplet tile, title, and the assurance badge the reference puts
            opposite it. "Verified" describes the SCREENING this platform
            requires of a listed blood bank - never a promise about any
            individual unit - which is why the badge sits with the title and
            not on a result row. */}
        {/* Hero, as the reference draws it: the droplet tile, the name at
            full size, the tagline, and the assurance badge beside it. */}
        <View style={styles.hero}>
          <View style={[styles.heroMark, { backgroundColor: colors.tintBlueBg }]}>
            <Icon name="droplet" size={30} color={colors.blue} />
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle} numberOfLines={1}>
              {t('bloodFinder.title')}
            </Text>
            <Text style={styles.heroSubtitle}>{t('bloodFinder.heroSubtitle')}</Text>
          </View>
          <View style={[styles.heroBadge, { backgroundColor: colors.tintBlueBg }]}>
            <Icon name="shield-check" size={18} color={colors.blue} />
            <View style={styles.heroBadgeBody}>
              <Text style={[styles.heroBadgeTitle, { color: colors.blue }]}>
                {t('bloodFinder.verifiedBadge')}
              </Text>
              <Text style={styles.heroBadgeNote}>{t('bloodFinder.verifiedBadgeNote')}</Text>
            </View>
          </View>
        </View>

        <FinderCard vm={vm} />

        <TrustAndEmergency vm={vm} />

        <ResultsSection vm={vm} />

        <MyRequestsSection vm={vm} />

        {/* The reference's four-up entry grid. Only the two destinations that
            exist are live; the donor screens are deliberately absent until the
            donor-privacy question behind them is answered (see
            docs/finder-screens-plan.md), because a tile that opens a list of
            named donors is the thing this platform must not ship. */}
        <View style={styles.quickGrid}>
          <QuickAction
            icon="droplet"
            tint="red"
            label={t('bloodFinder.quick.emergency')}
            onPress={() => router.push('/blood-finder/emergency')}
          />
          <QuickAction
            icon="users"
            tint="blue"
            label={t('bloodFinder.quick.findDonors')}
            onPress={() => router.push('/blood-finder/donors')}
          />
          <QuickAction
            icon="heart-pulse"
            tint="red"
            label={t('bloodFinder.quick.becomeDonor')}
            onPress={() => router.push('/blood-finder/become-donor')}
          />
          <QuickAction
            icon="book"
            tint="blue"
            label={t('bloodFinder.quick.education')}
            onPress={() => router.push('/blood-finder/education')}
          />
        </View>

        {/* Safety notice */}
        <View style={styles.notice} accessibilityRole="summary">
          <Icon name="shield-check" size={20} color={colors.blue} />
          <View style={styles.noticeBody}>
            <Text style={styles.noticeTitle}>{t('bloodFinder.safetyTitle')}</Text>
            <Text style={styles.noticeText}>{t('bloodFinder.safetyBody')}</Text>
          </View>
        </View>
      </ScrollView>

      {dialog.element}
    </Screen>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */
