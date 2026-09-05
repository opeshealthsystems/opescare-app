import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  GradientButton,
  Icon,
  radii,
  ScreenHeader,
  SectionHeader,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import {
  extractDeletionError,
  useAccountDeletionState,
  useCancelAccountDeletion,
  useRequestAccountDeletion,
  type AccountDeletionDisclosure,
  type DisclosureItem,
  type ReauthMethod,
} from '../../lib/api/accountDeletionQueries';

/**
 * Delete your account.
 * ====================
 *
 * The screen that closes a hard store blocker: Apple 5.1.1(v) and Google Play
 * both require an app offering account creation to offer account deletion from
 * inside the app, and this app had neither the endpoint nor the screen.
 *
 * ── The one rule this screen is built around ─────────────────────────────
 *
 * Do not promise what the platform does not do.
 *
 * On a medical-records platform, closing an account is not deleting a record.
 * `patients.id` is the parent of 88 ON DELETE CASCADE foreign keys —
 * prescriptions, lab results, encounters, invoices, and the patient's own
 * access log among them — so a real cascade would erase a pharmacy's record of
 * medicine it dispensed and the proof of who read the file. The server
 * therefore erases the ACCOUNT and retains the clinical record under
 * Cameroon's 10-year rule.
 *
 * A screen that said "delete my account" and left it there would be a lie by
 * omission. So this one renders FOUR sections before the button, in this order
 * and at equal weight:
 *
 *   1. Erased immediately        credentials, sessions, devices, phone, email,
 *                                address, emergency contact, national ID
 *   2. Left in place, not you    the patient row, name overwritten
 *   3. Kept, because the law     the clinical record, with LIVE COUNTS from
 *      requires it               this patient's own file, the statute named,
 *                                and the date it is destroyed
 *   4. What we cannot delete     immutable clinical events, the access log,
 *                                facility-held copies, fiscal records
 *
 * Section 4 is the one most deletion screens omit and the reason this one can
 * be trusted.
 *
 * ── Not one of those sentences is written here ───────────────────────────
 *
 * Every line in all four sections arrives from the server already translated
 * (lang/{en,fr}/account_deletion.php), with the counts and dates computed from
 * the real database. This file renders them verbatim and authors no claim of
 * its own. That is deliberate: a promise duplicated in a client string is a
 * promise that silently stops being true the first time the server changes.
 * The only copy written here is chrome — labels, placeholders, and the
 * confirmation prompts.
 *
 * ── Two locks, and a long undo ───────────────────────────────────────────
 *
 * Confirming needs a password or PIN (proof it is the account holder, not
 * somebody holding an unlocked phone) AND the typed word (proof the disclosure
 * was read, not scrolled past). Nothing is erased on confirm: the server opens
 * a 30-day window, and this screen becomes the cancel button for the whole of
 * it.
 *
 * The session is deliberately NOT ended on request. Cancelling needs it, and
 * handing somebody an irreversible countdown with no way to stop it would be
 * worse than not offering deletion at all.
 *
 * ── Kit ──────────────────────────────────────────────────────────────────
 *
 * `components/opes-ui` only — `<Icon>`, never Lucide, never emoji. Every
 * colour comes from `useTheme().colors`, whose default palette is the
 * OpesCare brand (#0F4C81).
 */
export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const dialog = useDialog();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data, isLoading, isError, refetch, isRefetching } = useAccountDeletionState();
  const requestDeletion = useRequestAccountDeletion();
  const cancelDeletion = useCancelAccountDeletion();

  const [credential, setCredential] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');

  const closure = data?.closure ?? null;
  const disclosure = data?.disclosure ?? null;
  const isPending = closure?.is_pending === true;

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }, [router]);

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const submit = useCallback(() => {
    if (!disclosure) return;

    dialog.confirm({
      title: t('accountDeletion.confirmDialogTitle', { defaultValue: 'Start the countdown?' }),
      message: t('accountDeletion.confirmDialogMessage', {
        days: disclosure.grace_period_days,
        defaultValue:
          'Your account closes in {{days}} days. Nothing is erased today, and you can cancel any time before then from this screen.',
      }),
      confirmLabel: t('accountDeletion.confirmDialogConfirm', { defaultValue: 'Start the countdown' }),
      cancelLabel: t('accountDeletion.confirmDialogCancel', { defaultValue: 'Not yet' }),
      destructive: true,
      onConfirm: async () => {
        try {
          const result = await requestDeletion.mutateAsync({
            confirmation: confirmation.trim(),
            credential,
            reason: reason.trim() || undefined,
          });
          // The credential never lingers in component state after use.
          setCredential('');
          setConfirmation('');
          dialog.alert(
            t('accountDeletion.pendingTitle', { defaultValue: 'Your account is closing' }),
            // The server's own sentence, which names the real date.
            result.message,
            'warning',
          );
        } catch (error) {
          const { code, message } = extractDeletionError(error);
          setCredential('');
          dialog.alert(
            code === 'no_credential'
              ? t('accountDeletion.noCredentialTitle', { defaultValue: 'We cannot confirm it is you' })
              : t('accountDeletion.genericErrorTitle', { defaultValue: 'That did not go through' }),
            // Prefer the server's message: it is the one that states what did
            // and did not change ("Your account has not been changed").
            message ??
              t('accountDeletion.genericErrorBody', {
                defaultValue: 'Nothing has been changed. Please try again.',
              }),
            'critical',
          );
        }
      },
    });
  }, [confirmation, credential, disclosure, dialog, reason, requestDeletion, t]);

  const cancel = useCallback(() => {
    dialog.confirm({
      title: t('accountDeletion.cancelDialogTitle', { defaultValue: 'Cancel the closure?' }),
      message: t('accountDeletion.cancelDialogMessage', {
        defaultValue:
          'Your account stays exactly as it is. Nothing has been erased, so there is nothing to restore.',
      }),
      confirmLabel: t('accountDeletion.cancelDialogConfirm', { defaultValue: 'Keep my account' }),
      cancelLabel: t('accountDeletion.cancelDialogKeep', { defaultValue: 'Leave it closing' }),
      onConfirm: async () => {
        try {
          const result = await cancelDeletion.mutateAsync();
          dialog.alert(
            t('accountDeletion.keepAccount', { defaultValue: 'Keep my account' }),
            result.message,
            'success',
          );
        } catch (error) {
          const { message } = extractDeletionError(error);
          dialog.alert(
            t('accountDeletion.genericErrorTitle', { defaultValue: 'That did not go through' }),
            message ??
              t('accountDeletion.genericErrorBody', {
                defaultValue: 'Nothing has been changed. Please try again.',
              }),
            'critical',
          );
        }
      },
    });
  }, [cancelDeletion, dialog, t]);

  /* ---------------------------------------------------------------- */
  /* States                                                            */
  /* ---------------------------------------------------------------- */

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader
          title={t('accountDeletion.title', { defaultValue: 'Delete your account' })}
          onBack={goBack}
        />
        <View style={styles.centre}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centreText}>
            {t('accountDeletion.loading', { defaultValue: 'Checking your account' })}
          </Text>
        </View>
        {dialog.element}
      </SafeAreaView>
    );
  }

  if (isError || !data || !disclosure) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader
          title={t('accountDeletion.title', { defaultValue: 'Delete your account' })}
          onBack={goBack}
        />
        <View style={styles.centre}>
          <Icon name="alert-circle" size={28} color={colors.danger} />
          <Text style={styles.errorTitle}>
            {t('accountDeletion.errorTitle', { defaultValue: 'We could not load this' })}
          </Text>
          <Text style={styles.centreText}>
            {t('accountDeletion.errorBody', {
              defaultValue:
                'Nothing has been changed. We could not read your account details just now — try again in a moment.',
            })}
          </Text>
          <TouchableOpacity onPress={() => void refetch()} style={styles.retry}>
            <Text style={styles.retryText}>
              {t('accountDeletion.retry', { defaultValue: 'Try again' })}
            </Text>
          </TouchableOpacity>
        </View>
        {dialog.element}
      </SafeAreaView>
    );
  }

  const methods = data.reauth_methods;
  const canSubmit =
    credential.trim().length > 0 && confirmation.trim().length > 0 && !requestDeletion.isPending;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader
        title={t('accountDeletion.title', { defaultValue: 'Delete your account' })}
        subtitle={t('accountDeletion.subtitle', {
          defaultValue: 'Close your account and erase your personal details',
        })}
        onBack={goBack}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={colors.primary}
            />
          }
        >
          {/*
            A closure already running. The countdown replaces the form entirely:
            offering "delete" again to somebody whose account is already closing
            would be a second, meaningless decision on top of a live one.
          */}
          {isPending && closure ? (
            <>
              <Card accentColor={colors.warning} style={styles.panel}>
                <View style={styles.panelHead}>
                  <View style={[styles.badge, { backgroundColor: colors.statusWarningBg }]}>
                    <Icon name="clock" size={20} color={colors.warning} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.panelTitle}>{closure.headline}</Text>
                    {closure.countdown ? (
                      <Text style={[styles.countdown, { color: colors.warning }]}>
                        {closure.countdown}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.panelBody}>{closure.body}</Text>
              </Card>

              <Card style={styles.panel}>
                <View style={styles.panelHead}>
                  <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
                    <Icon name="info" size={20} color={colors.primary} />
                  </View>
                  <Text style={[styles.panelTitle, styles.flex]}>
                    {t('accountDeletion.stillSignedInTitle', {
                      defaultValue: 'You are still signed in',
                    })}
                  </Text>
                </View>
                <Text style={styles.panelBody}>
                  {t('accountDeletion.stillSignedInBody', {
                    defaultValue:
                      'Deliberately. You need this session to cancel, so we do not lock you out during the wait. Your account works normally until the closing date.',
                  })}
                </Text>
              </Card>

              <GradientButton
                label={t('accountDeletion.cancelCta', { defaultValue: 'Cancel — keep my account' })}
                onPress={cancel}
                loading={cancelDeletion.isPending}
                icon="none"
                style={styles.cta}
              />

              {/* The four sections stay visible while a closure runs: the
                  patient deciding whether to cancel needs the same facts they
                  were shown when they decided to start. */}
              <Disclosure disclosure={disclosure} colors={colors} styles={styles} t={t} />
            </>
          ) : (
            <>
              {closure && closure.status === 'completed' ? (
                <Card accentColor={colors.danger} style={styles.panel}>
                  <Text style={styles.panelTitle}>{closure.headline}</Text>
                  <Text style={styles.panelBody}>{closure.body}</Text>
                </Card>
              ) : null}

              {/* Headline + summary, server-authored. */}
              <Card accentColor={colors.primary} style={styles.panel}>
                <Text style={styles.headline}>{disclosure.headline}</Text>
                <Text style={styles.panelBody}>{disclosure.summary}</Text>
              </Card>

              <Text style={styles.hint}>
                {t('accountDeletion.reviewHint', {
                  defaultValue: 'Read all four sections before you decide. They are not the same thing.',
                })}
              </Text>

              <Disclosure disclosure={disclosure} colors={colors} styles={styles} t={t} />

              {/* ---------------- Confirmation ---------------- */}
              <SectionHeader
                title={t('accountDeletion.confirmHeading', { defaultValue: 'Confirm it is you' })}
                variant="overline"
                style={styles.sectionHeader}
              />

              <Card style={styles.panel}>
                <Text style={styles.panelBody}>{disclosure.confirmation.reauth_note}</Text>

                <Text style={styles.fieldLabel}>{credentialLabel(methods, t)}</Text>
                <TextInput
                  value={credential}
                  onChangeText={setCredential}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  // Keeps the password out of the keyboard's learned
                  // dictionary and out of autofill suggestions elsewhere.
                  textContentType="password"
                  placeholder={t('accountDeletion.credentialPlaceholder', {
                    defaultValue: 'Enter it to continue',
                  })}
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />

                <Text style={styles.fieldLabel}>
                  {t('accountDeletion.confirmLabel', {
                    phrase: disclosure.confirmation.phrase,
                    defaultValue: 'Type {{phrase}}',
                  })}
                </Text>
                <Text style={styles.fieldHelp}>{disclosure.confirmation.instruction}</Text>
                <TextInput
                  value={confirmation}
                  onChangeText={setConfirmation}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder={disclosure.confirmation.phrase}
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />

                <Text style={styles.fieldLabel}>
                  {t('accountDeletion.reasonLabel', {
                    defaultValue: 'Why are you leaving? (optional)',
                  })}
                </Text>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  maxLength={290}
                  placeholder={t('accountDeletion.reasonPlaceholder', {
                    defaultValue: 'This is not required',
                  })}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.inputMultiline]}
                />
              </Card>

              <GradientButton
                label={
                  requestDeletion.isPending
                    ? t('accountDeletion.ctaBusy', { defaultValue: 'Submitting' })
                    : t('accountDeletion.cta', { defaultValue: 'Delete my account' })
                }
                onPress={submit}
                disabled={!canSubmit}
                loading={requestDeletion.isPending}
                icon="none"
                accessibilityHint={disclosure.summary}
                style={styles.cta}
              />

              <TouchableOpacity onPress={goBack} style={styles.secondary}>
                <Text style={styles.secondaryText}>
                  {t('accountDeletion.keepAccount', { defaultValue: 'Keep my account' })}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {dialog.element}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* The four sections                                                   */
/* ------------------------------------------------------------------ */

/**
 * Rendered identically before and during a closure. Every string is the
 * server's; the only decisions made here are which icon and which accent
 * colour each section carries.
 */
function Disclosure({
  disclosure,
  colors,
  styles,
  t,
}: {
  disclosure: AccountDeletionDisclosure;
  colors: Palette;
  styles: ReturnType<typeof makeStyles>;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <>
      <Block
        icon="trash"
        accent={colors.danger}
        title={disclosure.erased.title}
        note={disclosure.erased.note}
        items={disclosure.erased.items}
        colors={colors}
        styles={styles}
      />

      <Block
        icon="eye-off"
        accent={colors.textSecondary}
        title={disclosure.deidentified.title}
        note={disclosure.deidentified.note}
        items={disclosure.deidentified.items}
        colors={colors}
        styles={styles}
      />

      {/* Retained — the section that carries the real numbers. */}
      <Card accentColor={colors.primary} style={styles.panel}>
        <View style={styles.panelHead}>
          <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
            <Icon name="archive" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.panelTitle, styles.flex]}>{disclosure.retained.title}</Text>
        </View>

        <Text style={styles.panelBody}>{disclosure.retained.note}</Text>

        {disclosure.retained.counts.length > 0 ? (
          <View style={styles.counts}>
            <Text style={styles.countsTitle}>
              {t('accountDeletion.keptCountsTitle', {
                defaultValue: 'What stays on file, in your record today',
              })}
            </Text>
            {disclosure.retained.counts.map((row) => (
              <View key={row.key} style={styles.countRow}>
                <Text style={styles.countLabel}>{row.label}</Text>
                <Text style={[styles.countValue, { color: colors.primary }]}>{row.count}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.legalBasis}>{disclosure.retained.legal_basis}</Text>

        <View style={[styles.purge, { borderColor: colors.border }]}>
          <Icon name="clock" size={16} color={colors.textSecondary} />
          <Text style={styles.purgeText}>{disclosure.retained.purge_note}</Text>
        </View>
      </Card>

      {/* The section most deletion screens leave out. */}
      <Block
        icon="lock"
        accent={colors.warning}
        title={disclosure.cannot_delete.title}
        items={disclosure.cannot_delete.items}
        colors={colors}
        styles={styles}
      />
    </>
  );
}

function Block({
  icon,
  accent,
  title,
  note,
  items,
  colors,
  styles,
}: {
  icon: IconName;
  accent: string;
  title: string;
  note?: string;
  items: DisclosureItem[];
  colors: Palette;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Card accentColor={accent} style={styles.panel}>
      <View style={styles.panelHead}>
        <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name={icon} size={20} color={accent} />
        </View>
        <Text style={[styles.panelTitle, styles.flex]}>{title}</Text>
      </View>

      {note ? <Text style={styles.panelBody}>{note}</Text> : null}

      <View style={styles.items}>
        {items.map((item) => (
          <View key={item.key} style={styles.item}>
            <View style={[styles.bullet, { backgroundColor: accent }]} />
            <Text style={styles.itemText}>{item.text}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

/**
 * Ask for the credential this patient actually has.
 *
 * A patient registered at a facility desk may hold a PIN and no portal
 * password; one who self-registered in the app holds both. The server reports
 * the real set, so the label never asks for something that does not exist.
 */
function credentialLabel(
  methods: ReauthMethod[],
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (methods.length === 1 && methods[0] === 'password') {
    return t('accountDeletion.credentialLabelPassword', { defaultValue: 'Your password' });
  }
  if (methods.length === 1 && methods[0] === 'pin') {
    return t('accountDeletion.credentialLabelPin', { defaultValue: 'Your PIN' });
  }
  return t('accountDeletion.credentialLabelBoth', { defaultValue: 'Your password or PIN' });
}

/* ------------------------------------------------------------------ */

/*
 * `typography` is a token bag (fontFamily / size / lineHeight), not a set of
 * ready-made text styles — the same way app/privacy/access.tsx composes them.
 * These three locals keep the composition in one place instead of repeating
 * the triple at every rule.
 */
const body = {
  fontFamily: typography.fontFamily.regular,
  fontSize: typography.size.sm,
  lineHeight: typography.lineHeight.sm,
} as const;

const bodyStrong = {
  fontFamily: typography.fontFamily.semiBold,
  fontSize: typography.size.sm,
  lineHeight: typography.lineHeight.sm,
} as const;

const caption = {
  fontFamily: typography.fontFamily.regular,
  fontSize: typography.size.xs,
  lineHeight: typography.lineHeight.xs,
} as const;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    content: { padding: spacing.lg, paddingBottom: spacing.xxl },

    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
    centreText: { ...body, color: c.textSecondary, textAlign: 'center' },
    errorTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
      textAlign: 'center',
    },
    retry: {
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.pill,
      backgroundColor: c.primarySoft,
    },
    retryText: { ...bodyStrong, color: c.primary },

    panel: { marginBottom: spacing.md },
    panelHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    panelTitle: { ...bodyStrong, fontSize: typography.size.md, color: c.textPrimary },
    panelBody: { ...body, color: c.textSecondary },
    headline: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: c.textPrimary,
      marginBottom: spacing.xs,
    },
    countdown: { ...caption, fontFamily: typography.fontFamily.bold, marginTop: 2 },

    hint: { ...caption, color: c.textMuted, marginBottom: spacing.md, marginTop: spacing.xs },

    sectionHeader: { marginTop: spacing.sm },

    items: { marginTop: spacing.sm, gap: spacing.xs },
    item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
    itemText: { ...body, color: c.textPrimary, flex: 1 },

    counts: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: c.surfaceMuted,
    },
    countsTitle: { ...caption, color: c.textSecondary, marginBottom: spacing.xs },
    countRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    countLabel: { ...body, color: c.textPrimary, flex: 1 },
    countValue: { ...bodyStrong },

    legalBasis: { ...body, color: c.textSecondary, marginTop: spacing.md },
    purge: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    purgeText: { ...caption, color: c.textSecondary, flex: 1 },

    fieldLabel: { ...bodyStrong, color: c.textPrimary, marginTop: spacing.md },
    fieldHelp: { ...caption, color: c.textMuted, marginTop: 2, marginBottom: spacing.xs },
    input: {
      ...body,
      marginTop: spacing.xs,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
      color: c.textPrimary,
      backgroundColor: c.surface,
    },
    inputMultiline: { minHeight: 72, textAlignVertical: 'top' },

    cta: { marginTop: spacing.lg },
    secondary: { marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.sm },
    secondaryText: { ...bodyStrong, color: c.primary },
  });
