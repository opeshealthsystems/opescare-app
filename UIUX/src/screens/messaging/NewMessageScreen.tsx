/**
 * MSG-002 — New Message.
 *
 * Starts a conversation with a named doctor through
 * `POST /patient/messages/threads`, whose contract is exactly three fields:
 * `provider_id` (the staff user id, required), `subject` (optional, ≤255) and
 * `body` (required, ≤4000). The response is the full thread including the
 * message that was just written, so on success we go straight into that
 * conversation rather than back to the inbox.
 *
 * The server reuses an open thread with the same doctor if one exists, so this
 * screen never creates a duplicate conversation — it just adds to the one the
 * patient already has.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { findProviders, startThread, type PortalProvider } from '../../api';
import { Card, Icon, ScreenHeader, SectionHeader } from '../../components';
import { a11yJoin } from '../../components/a11y';
import { useTranslation } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  AsyncBoundary,
  CareButton,
  errorMessage,
  ProviderAvatar,
  SearchField,
  useAsync,
} from '../care/shared';

const SUBJECT_MAX = 255;
const BODY_MAX = 4000;

export function NewMessageScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'NewMessage'>>();
  const presetId = params?.providerId ? Number(params.providerId) : null;

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<PortalProvider | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    const page = await findProviders({ per_page: 50, sort: 'rating', ...(query.trim() ? { q: query.trim() } : {}) });
    return page.data;
  }, [query]);

  const state = useAsync<PortalProvider[]>(load, [query]);

  // A screen reached from a provider's profile arrives with them chosen.
  const providers = state.data;
  React.useEffect(() => {
    if (picked || presetId === null || !providers) return;
    const match = providers.find((p) => p.id === presetId);
    if (match) setPicked(match);
  }, [providers, presetId, picked]);

  const canSend = !!picked && body.trim().length > 0 && !sending;

  const send = useCallback(async () => {
    if (!picked || inFlight.current) return;
    const text = body.trim();
    if (!text) return;

    inFlight.current = true;
    setSending(true);
    setSendError(null);
    try {
      const thread = await startThread({
        provider_id: picked.id,
        ...(subject.trim() ? { subject: subject.trim().slice(0, SUBJECT_MAX) } : {}),
        body: text.slice(0, BODY_MAX),
      });
      setBody('');
      const target = { threadId: thread.id, title: thread.provider_name ?? picked.name };
      if (typeof navigation.replace === 'function') navigation.replace('MessageThread', target);
      else navigation.navigate('MessageThread', target);
    } catch (e) {
      // Says plainly that the message did NOT go, and that the draft survived.
      setSendError(errorMessage(e, t('messaging.newMessage.sendFailed')));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
    // `t` is a dependency (rule 3) so the failure text follows the locale.
  }, [picked, body, subject, navigation, t]);

  const remaining = useMemo(() => BODY_MAX - body.length, [body]);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('messaging.newMessage.title')} subtitle={t('messaging.newMessage.subtitle')} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionHeader title={t('messaging.newMessage.whoFor')} />

        {picked ? (
          <Card>
            <View style={styles.pickedRow}>
              <ProviderAvatar name={picked.name} size={44} />
              <View style={styles.pickedText}>
                <Text style={styles.pickedName} numberOfLines={1}>
                  {picked.name}
                </Text>
                <Text style={styles.pickedMeta} numberOfLines={1}>
                  {[picked.specialty, picked.department_name].filter(Boolean).join('  •  ') ||
                    t('messaging.newMessage.facilityFallback')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPicked(null)}
                hitSlop={8}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('messaging.newMessage.changeA11y')}
              >
                <Text style={styles.change}>{t('messaging.newMessage.change')}</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ) : (
          <>
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder={t('messaging.newMessage.searchPlaceholder')}
              onSubmit={() => setQuery(search)}
            />
            <AsyncBoundary
              state={state}
              onLink={() => navigation.navigate('MyHealthId')}
              loadingLabel={t('messaging.newMessage.loadingDoctors')}
              isEmpty={(list) => list.length === 0}
              empty={
                <Card>
                  <Text style={styles.emptyText}>{t('messaging.newMessage.noMatch')}</Text>
                </Card>
              }
            >
              {(list) => (
                <Card variant="flush">
                  {list.map((p, i) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.option, i < list.length - 1 && styles.optionDivider]}
                      activeOpacity={0.75}
                      onPress={() => setPicked(p)}
                      accessibilityRole="button"
                      accessibilityLabel={a11yJoin(p.name, p.specialty, p.department_name)}
                    >
                      <ProviderAvatar name={p.name} size={40} />
                      <View style={styles.optionText}>
                        <Text style={styles.optionName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={styles.optionMeta} numberOfLines={1}>
                          {[p.specialty, p.department_name].filter(Boolean).join('  •  ')}
                        </Text>
                      </View>
                      <Icon name="chevron-right" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </AsyncBoundary>
          </>
        )}

        {!!picked && (
          <>
            <SectionHeader title={t('messaging.newMessage.yourMessage')} />
            <Card>
              <Text style={styles.label}>{t('messaging.newMessage.subjectLabel')}</Text>
              <TextInput
                style={styles.input}
                value={subject}
                onChangeText={(v) => setSubject(v.slice(0, SUBJECT_MAX))}
                placeholder={t('messaging.newMessage.subjectPlaceholder')}
                placeholderTextColor={colors.textMuted}
                maxLength={SUBJECT_MAX}
                returnKeyType="next"
                autoComplete="off"
                textContentType="none"
                accessibilityLabel={t('messaging.newMessage.subjectLabel')}
              />

              <Text style={[styles.label, styles.labelSpaced]}>{t('messaging.newMessage.messageLabel')}</Text>
              <TextInput
                style={[styles.input, styles.bodyInput]}
                value={body}
                onChangeText={(v) => setBody(v.slice(0, BODY_MAX))}
                placeholder={t('messaging.newMessage.messagePlaceholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                maxLength={BODY_MAX}
                autoComplete="off"
                textContentType="none"
                accessibilityLabel={t('messaging.newMessage.messageLabel')}
              />
              <Text style={styles.counter}>{t('messaging.newMessage.charsLeft', { count: remaining })}</Text>
            </Card>

            <View style={styles.notice}>
              <Icon name="info" size={16} color={colors.link} />
              <Text style={styles.noticeText}>{t('messaging.newMessage.notice')}</Text>
            </View>

            {!!sendError && (
              <View style={styles.errorBox}>
                <Icon name="alert-circle" size={16} color={colors.statusCritical} />
                <Text style={styles.errorText}>{sendError}</Text>
              </View>
            )}

            <CareButton
              label={sending ? t('messaging.newMessage.sending') : t('messaging.newMessage.send')}
              icon="send"
              onPress={send}
              disabled={!canSend}
              loading={sending}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },

  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pickedText: { flex: 1, minWidth: 0 },
  pickedName: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  pickedMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  change: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.link,
  },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  optionDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  optionText: { flex: 1, minWidth: 0 },
  optionName: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  optionMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  emptyText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  label: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  labelSpaced: { marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  bodyInput: { minHeight: 140, paddingTop: spacing.sm },
  counter: {
    marginTop: spacing.sm,
    textAlign: 'right',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  noticeText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.statusCriticalBg,
  },
  errorText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.statusCritical,
  },
});
