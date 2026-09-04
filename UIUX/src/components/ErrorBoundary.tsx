/**
 * The last line before a blank screen.
 *
 * Until now a render error anywhere in this app unmounted the whole tree and
 * left white. No message, no way back, no record — a clinician mid-ward-round
 * holding a phone that had simply stopped, and nothing afterwards to say what
 * happened. React gives exactly one mechanism for this and it must be a class
 * component; there is no hook equivalent.
 *
 * ── Deliberate choices ────────────────────────────────────────────────────
 *
 * TRANSLATED WITHOUT THE CONTEXT. Every screen reads `t` from `useTranslation`,
 * which needs `LocaleProvider` above it. This boundary sits ABOVE that provider
 * on purpose — a crash inside `LocaleProvider`'s own render has to be caught
 * too — so it cannot use the hook, and a crash there would leave the context
 * unusable anyway. It reads `getLocale()` (a plain module-level value, no
 * React) and picks from the table below.
 *
 * STRINGS ARE LOCAL, NOT IN THE CATALOGUE. `src/i18n/catalog/**` is owned by
 * another agent this session, so these five strings live here rather than
 * being merged into a file being edited concurrently. They belong in
 * `common.crash.*`; see the note under COPY below for the exact keys to lift.
 *
 * NO NEW COLOURS OR PRIMITIVES. Tokens from `theme/theme`, `Icon` and
 * `GradientButton` as they already exist.
 *
 * IT DOES NOT SWALLOW THE ERROR. `recordCrash` writes it to the console and to
 * a small on-device ring (`lib/crashLog.ts`), and the reference code is shown
 * on screen so a patient or clinician can read it out. `crashLog.ts` documents
 * plainly what that still is not — nothing leaves the device.
 */
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BUILD_STAMP } from '../buildInfo';
import { getLocale } from '../i18n/LocaleProvider';
import { flushCrashQueue, makeReference, recordCrash } from '../lib/crashLog';
import { colors, radii, spacing, typography } from '../theme/theme';
import { GradientButton } from './GradientButton';
import { Icon } from './Icon';

/**
 * COPY — to be lifted into the catalogues under `common.crash.*` when
 * `src/i18n/catalog/{en,fr}/core.ts` is free to edit. The five keys are
 * `title`, `body`, `retry`, `restart` and `reference` ({code} placeholder).
 *
 * The body deliberately says the clinical record itself is untouched, because
 * that is the first thing someone holding a frozen chart wants to know, and it
 * is true: a render error is on the phone, not in the hospital's data.
 */
const COPY = {
  en: {
    title: 'This screen could not be shown',
    body: 'Something went wrong inside the app. Your record has not been changed — nothing was lost at the hospital. Try again, and if this screen keeps coming back, quote the code below.',
    retry: 'Try again',
    restart: 'Restart the app',
    reference: (code: string) => `Reference ${code}`,
  },
  fr: {
    title: 'Cet écran n’a pas pu s’afficher',
    body: 'Un problème est survenu dans l’application. Votre dossier n’a pas été modifié — rien n’a été perdu à l’hôpital. Réessayez, et si cet écran revient, communiquez le code ci-dessous.',
    retry: 'Réessayer',
    restart: 'Redémarrer l’application',
    reference: (code: string) => `Référence ${code}`,
  },
} as const;

type Props = { children: React.ReactNode };

type State = { error: Error | null; reference: string | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, reference: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  /**
   * Flush yesterday's crash reports. This boundary is the outermost component
   * in the tree, so it mounts exactly once per launch — which makes it the
   * cheapest honest place to hang launch-time background work.
   *
   * Not awaited, and `flushCrashQueue` never rejects: nothing about the upload
   * may delay the first paint. Only scrubbed reports are in that queue; see
   * `lib/crashLog.ts`.
   */
  componentDidMount(): void {
    void flushCrashQueue();
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // A fresh reference per crash, so two different failures are two different
    // codes rather than one code covering both.
    const reference = makeReference();
    this.setState({ reference });
    // Deliberately not awaited: `recordCrash` never rejects, and blocking the
    // commit of the fallback screen on a storage write would be backwards.
    void recordCrash(error, info.componentStack ?? '', reference, BUILD_STAMP);
  }

  /**
   * Remount the subtree. On a transient failure — a null in one API payload, a
   * bad navigation param — this genuinely recovers, because the children are
   * rebuilt from scratch and refetch as they mount. If the same render throws
   * again the boundary simply catches again, which is the correct outcome and
   * not a loop.
   */
  private reset = (): void => {
    this.setState({ error: null, reference: null });
  };

  /**
   * The stronger way out. On web this is a real reload — the app is served at
   * /app/ and a reload re-runs the whole bundle, which clears any module-level
   * state the crash corrupted. On native there is no supported way to restart
   * the process without `expo-updates` (not a dependency, and not worth adding
   * for this), so it degrades to the same remount rather than pretending.
   */
  private restart = (): void => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    this.reset();
  };

  render(): React.ReactNode {
    const { error, reference } = this.state;
    if (!error) return this.props.children;

    const copy = COPY[getLocale()] ?? COPY.en;

    return (
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.circle}>
            <Icon name="alert-triangle" size={30} color={colors.statusWarning} />
          </View>

          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>

          <GradientButton label={copy.retry} onPress={this.reset} icon="none" style={styles.cta} />

          <TouchableOpacity onPress={this.restart} activeOpacity={0.7} style={styles.secondary}>
            <Icon name="refresh" size={16} color={colors.link} />
            <Text style={styles.secondaryLabel}>{copy.restart}</Text>
          </TouchableOpacity>

          {!!reference && <Text style={styles.reference}>{copy.reference(reference)}</Text>}
          <Text style={styles.build}>{BUILD_STAMP}</Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    // Opaque: the boundary renders ABOVE the navigation tree, so it cannot rely
    // on the app-wide page base behind it (see `colors.background`).
    backgroundColor: colors.page,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  circle: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.statusWarningBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.lg,
    lineHeight: typography.lineHeight.lg,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    // French runs 15–25% longer; this block is centred prose with room to grow.
    maxWidth: 340,
  },
  cta: {
    marginTop: spacing.xl,
    alignSelf: 'stretch',
    maxWidth: 340,
  },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  secondaryLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.link,
  },
  reference: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  build: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
