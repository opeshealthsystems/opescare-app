/**
 * RoleGate — "this part of OpesCare is not part of your role".
 *
 * The clinician area admits every professional with a provider token: doctors
 * and nurses, but also the receptionist, the pharmacist and the lab
 * technician. The server now refuses each of them the routes their role does
 * not hold (403 `role_forbidden`, per `config/staff_capabilities.php`). This
 * component is the phone-side half of that decision: a screen whose role does
 * not hold the capability is never mounted, so it fires no request the server
 * would refuse and never shows a half-drawn page with a red error under it.
 *
 *     <RoleGate need={['prescribe']}>
 *       <PrescribeScreenBody />
 *     </RoleGate>
 *
 * `need` is ANY-OF, like the middleware. When the role lacks all of them the
 * gate renders `RoleGateScreen` in place of the children — modelled on
 * `app/clinician/wrong-app.tsx`: an amber shield, a plain sentence saying
 * what this account IS for, and one way out (back to Today). `router.replace`
 * rather than `push`: a refusal is a dead end, not a step, and must not stack.
 *
 * It is a UI gate, NOT a security boundary. The server authorises every
 * request on the token it was given; this only decides what is worth drawing.
 *
 * `RoleRefusedNotice` is the inline sibling for a refusal the SERVER sends
 * (`isRoleForbidden`) on a screen that was drawn — the chart's dead state, a
 * list that 403'd — and carries no retry, because retrying a role decision
 * buys nothing.
 */
import { useMemo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, ScreenHeader, spacing, useTheme, type Palette } from '@/components/opes-ui';
import { doctorRoutes } from '@/components/doctor/chartRoutes';
import {
  roleFamily,
  roleLabelKey,
  useProviderRole,
  useStaffCapability,
  type Capability,
} from '@/lib/staffCapabilities';

// ── Wording shared by the screen and the inline notice ────────────────────

/**
 * What the signed-in role IS for, from `opesDoctor.roleGate.scope.<family>`.
 * A non-hook helper so it can be composed into any message; called from
 * render, where the caller has already re-rendered off the i18n context.
 */
export function useRoleScopeCopy(): { roleLabel: string; scope: string } {
  const { t } = useTranslation();
  const role = useProviderRole();
  const roleLabel = String(t(roleLabelKey(role), { defaultValue: 'Staff' }));
  const scope = String(
    t(`opesDoctor.roleGate.scope.${roleFamily(role)}`, {
      defaultValue: 'Use the OpesCare web portal for the rest of your work.',
    }),
  );
  return { roleLabel, scope };
}

// ── The full-screen refusal ───────────────────────────────────────────────

export function RoleGateScreen({ need: _need }: { need?: readonly Capability[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const role = useProviderRole();
  const { roleLabel, scope } = useRoleScopeCopy();

  const body = role
    ? t('opesDoctor.roleGate.body', {
        defaultValue:
          'This part of OpesCare is for other roles at your facility. You are signed in as {{role}}, and that role does not include it.',
        role: roleLabel,
      })
    : t('opesDoctor.roleGate.bodyNoRole', {
        defaultValue:
          'This part of OpesCare is for other roles at your facility, and your account does not include it.',
      });

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={t('opesDoctor.roleGate.header', { defaultValue: 'Clinician area' })}
        showBack={false}
      />
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <EmptyState
            icon="shield"
            tint="amber"
            title={t('opesDoctor.roleGate.title', { defaultValue: 'Not part of your role' })}
            message={`${String(body)} ${scope}`}
            actionLabel={t('opesDoctor.roleGate.backHome', { defaultValue: 'Back to Today' })}
            actionHint={t('opesDoctor.roleGate.backHomeHint', {
              defaultValue: 'Opens the Today tab of the clinician area',
            })}
            onAction={() => router.replace(doctorRoutes.home)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── The wrapper ───────────────────────────────────────────────────────────

/**
 * Renders `children` when the signed-in role holds ANY of `need`; otherwise
 * the refusal screen. The children never mount on a refusal, so their hooks
 * — and their requests — never run.
 */
export function RoleGate({ need, children }: { need: readonly Capability[]; children: ReactNode }) {
  const allowed = useStaffCapability(...need);
  if (!allowed) return <RoleGateScreen need={need} />;
  return <>{children}</>;
}

// ── The inline notice for a refusal the server sent ───────────────────────

/**
 * For a screen that WAS drawn and then got `403 role_forbidden` from the
 * server (the app's map and the server's disagreed, or a role changed
 * mid-session). Same wording as the screen, no retry — a role decision does
 * not change on the second ask — and a way back to Today.
 */
export function RoleRefusedNotice() {
  const { t } = useTranslation();
  const router = useRouter();
  const { scope } = useRoleScopeCopy();
  return (
    <EmptyState
      icon="shield"
      tint="amber"
      title={t('opesDoctor.roleGate.serverRefusedTitle', {
        defaultValue: 'Your role does not include this',
      })}
      message={`${String(
        t('opesDoctor.roleGate.serverRefusedBody', {
          defaultValue: 'The server refused this for your role. Nothing was changed.',
        }),
      )} ${scope}`}
      actionLabel={t('opesDoctor.roleGate.backHome', { defaultValue: 'Back to Today' })}
      onAction={() => router.replace(doctorRoutes.home)}
    />
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    body: { flexGrow: 1, justifyContent: 'center', padding: spacing.md },
  });
