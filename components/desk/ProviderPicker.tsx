/**
 * Choosing a clinician at the front desk.
 *
 *   `ProviderChips`  — the filter row on the book: All · Unassigned · one chip
 *                      per clinician posted here.
 *   `ProviderPicker` — the radio list on a form: optionally "Unassigned"
 *                      (booking without a clinician), then every clinician
 *                      with their role under their name.
 *
 * Both take the rows from `useDeskProviders` and NEVER invent a name. While
 * the list loads or after it fails, the picker says so in place and the form
 * can still submit without a clinician (the contract makes `provider_id`
 * optional), because a desk that cannot see the roster still has to book.
 */
import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Chip, Icon, spacing, typography, useTheme, type Palette } from '@/components/opes-ui';
import { describeFailure } from '@/components/care/shared';
import { isNotServed, isRoleForbidden, type DeskProvider, type DeskProviderFilter } from '@/lib/api/deskQueries';
import { providerLabel, providerRoleLabel } from './shared';

// ── Filter chips ───────────────────────────────────────────────────────────

export function ProviderChips({
  providers,
  value,
  onChange,
}: {
  providers: readonly DeskProvider[];
  value: DeskProviderFilter;
  onChange: (next: DeskProviderFilter) => void;
}) {
  const { t } = useTranslation();
  const selectedId = typeof value === 'object' ? value.id : null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={chipStyles.row}>
      <Chip label={t('desk.filter.everyone')} icon="users" selected={value === 'all'} onPress={() => onChange('all')} />
      <Chip
        label={t('desk.unassigned')}
        icon="person"
        selected={value === 'unassigned'}
        onPress={() => onChange('unassigned')}
      />
      {providers.map((p) => (
        <Chip
          key={p.id}
          label={providerLabel(t, p)}
          icon="stethoscope"
          selected={selectedId === p.id}
          onPress={() => onChange({ id: p.id })}
        />
      ))}
    </ScrollView>
  );
}

const chipStyles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
});

// ── Radio list ─────────────────────────────────────────────────────────────

export function ProviderPicker({
  providers,
  loading,
  error,
  onRetry,
  value,
  onChange,
  allowUnassigned = false,
  excludeId,
  disabled,
}: {
  providers: readonly DeskProvider[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** The chosen `users.id`, or null for "Unassigned". */
  value: string | null;
  onChange: (next: string | null) => void;
  /** Offer "no clinician" as a legitimate choice (booking). Routing requires one. */
  allowUnassigned?: boolean;
  /** A clinician who cannot be chosen again — the one the row is already routed to. */
  excludeId?: string | null;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const rows = providers.filter((p) => p.id !== excludeId);

  let body: React.ReactNode;
  if (loading && rows.length === 0) {
    body = (
      <View style={styles.state} accessibilityRole="progressbar" accessibilityLabel={t('desk.providers.loading')}>
        <ActivityIndicator color={colors.blue} />
        <Text style={styles.stateText}>{t('desk.providers.loading')}</Text>
      </View>
    );
  } else if (error && rows.length === 0) {
    const message = isRoleForbidden(error)
      ? t('opesDoctor.roleGate.serverRefusedBody')
      : isNotServed(error)
        ? t('desk.providers.notServed')
        : describeFailure(error).message;
    body = (
      <View style={styles.state}>
        <Icon name="alert-circle" size={20} color={colors.statusWarning} />
        <Text style={styles.stateText}>{message}</Text>
        {!!onRetry && !isRoleForbidden(error) && (
          <TouchableOpacity onPress={onRetry} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.retry}>{t('opesCore.common.retry')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  } else if (rows.length === 0) {
    body = (
      <View style={styles.state}>
        <Icon name="users" size={20} color={colors.textMuted} />
        <Text style={styles.stateText}>{t('desk.providers.empty')}</Text>
      </View>
    );
  } else {
    body = rows.map((p, i) => (
      <Option
        key={p.id}
        title={providerLabel(t, p)}
        subtitle={providerRoleLabel(t, p)}
        icon="stethoscope"
        selected={value === p.id}
        divider={i < rows.length - 1}
        disabled={disabled}
        onPress={() => onChange(p.id)}
      />
    ));
  }

  return (
    <Card variant="flush">
      {allowUnassigned && (
        <Option
          title={t('desk.unassigned')}
          subtitle={t('desk.providers.unassignedHint')}
          icon="person"
          selected={value === null}
          divider
          disabled={disabled}
          onPress={() => onChange(null)}
        />
      )}
      {body}
    </Card>
  );
}

function Option({
  title,
  subtitle,
  icon,
  selected,
  divider,
  disabled,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon: 'stethoscope' | 'person';
  selected: boolean;
  divider?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={[styles.option, divider && styles.optionDivider, disabled && styles.optionOff]}
    >
      <View style={[styles.circle, selected && styles.circleOn]}>
        <Icon name={icon} size={18} color={selected ? colors.textOnBrand : colors.blue} />
      </View>
      <View style={styles.optionText}>
        <Text style={styles.optionTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.optionSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <Icon name={selected ? 'check-circle' : 'circle'} size={22} color={selected ? colors.blue : colors.border} />
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
    },
    optionDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    optionOff: { opacity: 0.5 },
    circle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleOn: { backgroundColor: colors.blue },
    optionText: { flex: 1, minWidth: 0 },
    optionTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    optionSubtitle: {
      marginTop: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    state: {
      alignItems: 'center',
      gap: spacing.xs,
      padding: spacing.md,
    },
    stateText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    retry: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.link,
      paddingVertical: spacing.xs,
    },
  });
