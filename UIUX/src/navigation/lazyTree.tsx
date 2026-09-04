/**
 * The code-splitting boundary between the two halves of the app.
 *
 * WHY THIS EXISTS
 * `RootNavigator` mounts exactly one tree per session kind — the patient tree
 * or the clinician tree, never both. That is a *runtime* boundary; until this
 * file existed it was not a *bundle* boundary, because both trees were static
 * imports and Metro therefore put both in one file. Audit 29 measured the cost:
 * making the app role-aware grew the web bundle 28.6%, and every patient in
 * Cameroon paid for the schedule, the chart viewer, the results inbox and the
 * staff messaging they can never open, over 2G, out of their own pocket.
 *
 * `createLazyTree` turns a tree into an async import, which Expo's web export
 * emits as its own chunk. A patient session never calls the loader, so those
 * bytes are never requested.
 *
 * THE THREE THINGS A LAZY BOUNDARY MUST NOT DO
 *
 * 1. Show a blank frame. On the network this app runs on, a chunk fetch is not
 *    instant, so `Suspense` gets a real loading state — the same spinner on the
 *    same background the root navigator already uses while auth resolves. The
 *    screen never goes white and never changes colour.
 *
 * 2. Die permanently on a dropped fetch. `React.lazy` memoises the *rejected*
 *    promise: once the chunk fails, that lazy component throws the same stale
 *    error forever, and a plain error boundary's "try again" would be a lie —
 *    it remounts a component that cannot succeed. So the retry here bumps
 *    `attempt`, which builds a NEW `React.lazy` (see the `useMemo` below) with
 *    a fresh promise, and the fetch genuinely happens again. This is the whole
 *    reason this is a component and not a one-line `React.lazy` call.
 *
 * 3. Lie about what happened. A failed chunk is a network problem, not a crash
 *    in a screen, and it says so: "we could not finish loading" plus a retry.
 *    The global `ErrorBoundary` would otherwise catch it and tell a clinician
 *    the app had crashed and offer them a reference code for a bug that is not
 *    one.
 *
 * STRINGS ARE LOCAL, NOT IN THE CATALOGUE — same reason as `ErrorBoundary`:
 * `src/i18n/catalog/**` is owned by another agent this session. They belong in
 * `common.chunk.*` and should be lifted there when that tree is free.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GradientButton } from '../components/GradientButton';
import { Icon } from '../components/Icon';
import { getLocale } from '../i18n/LocaleProvider';
import { colors, radii, spacing, typography } from '../theme/theme';

const COPY = {
  en: {
    title: 'Could not finish loading',
    body: 'This part of the app still needs to be downloaded, and the connection dropped before it arrived. Nothing is wrong with your record. Try again when you have signal.',
    retry: 'Try again',
  },
  fr: {
    title: 'Chargement non terminé',
    body: 'Cette partie de l’application doit encore être téléchargée, et la connexion a été interrompue avant la fin. Votre dossier n’a rien. Réessayez lorsque vous aurez du réseau.',
    retry: 'Réessayer',
  },
} as const;

/**
 * The loading state. Deliberately identical to `RootNavigator`'s own `Loader`
 * — a session that is still resolving and a tree that is still arriving look
 * the same to the person holding the phone, and should.
 */
function TreeFallback() {
  return (
    <View style={styles.centre}>
      <ActivityIndicator size="large" color={colors.blue} />
    </View>
  );
}

type ErrorProps = { children: React.ReactNode; onRetry: () => void };
type ErrorState = { failed: boolean };

class ChunkBoundary extends React.Component<ErrorProps, ErrorState> {
  state: ErrorState = { failed: false };

  static getDerivedStateFromError(): ErrorState {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    // Not routed to `recordCrash`: this is a failed download, not a defect, and
    // filling the on-device crash ring with signal drops would bury real ones.
    console.warn('[lazyTree] chunk load failed', error?.message ?? error);
  }

  private retry = (): void => {
    this.setState({ failed: false });
    this.props.onRetry();
  };

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    const copy = COPY[getLocale()] ?? COPY.en;

    return (
      <View style={[styles.centre, styles.padded]}>
        <View style={styles.circle}>
          <Icon name="alert-triangle" size={30} color={colors.statusWarning} />
        </View>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        <GradientButton label={copy.retry} onPress={this.retry} icon="none" style={styles.cta} />
      </View>
    );
  }
}

/**
 * Wrap a dynamic import as a navigator-mountable component.
 *
 * `load` must be a bare `() => import('./X')` call so the bundler can see it
 * statically and cut the chunk; anything indirect defeats the split silently.
 */
/* eslint-disable @typescript-eslint/no-explicit-any --
   `any` is the honest type here: the component on the other side of the split
   is a navigator, whose props are React Navigation's screen props. Naming them
   would couple this generic helper to one param list. */
export function createLazyTree(
  load: () => Promise<{ default: React.ComponentType<any> }>
): React.ComponentType<any> {
  function LazyTree(props: any) {
    const [attempt, setAttempt] = React.useState(0);
    // A new lazy per attempt — see note 2 in the header. `attempt` is the whole
    // point of the dependency array; the lint rule about `load` is satisfied
    // because it is a stable module-level closure.
    const Loaded = React.useMemo(() => React.lazy(load), [attempt]); // eslint-disable-line react-hooks/exhaustive-deps
    const retry = React.useCallback(() => setAttempt((n) => n + 1), []);

    return (
      <ChunkBoundary key={attempt} onRetry={retry}>
        <React.Suspense fallback={<TreeFallback />}>
          <Loaded {...props} />
        </React.Suspense>
      </ChunkBoundary>
    );
  }

  return LazyTree;
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  padded: {
    paddingHorizontal: spacing.lg,
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
    maxWidth: 340,
  },
  cta: {
    marginTop: spacing.xl,
    alignSelf: 'stretch',
    maxWidth: 340,
  },
});
