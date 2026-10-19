import React, { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, radii, spacing, typography, useTheme, type Palette } from '@/components/opes-ui';
import { ageFromDob, type EmergencySnapshot } from '@/lib/emergency/snapshot';
import '@/lib/i18n/authRedesignStrings';

/**
 * The opt-in Medical ID, shown without a session on the sign-in screen and the
 * app-lock cover. High contrast and compact: a first responder reads it in
 * seconds. Every row is optional — a field the patient never recorded is not
 * drawn at all, never shown as a guess.
 */
export function MedicalIdCard({
  snapshot,
  collapsible = false,
}: {
  snapshot: EmergencySnapshot;
  /** Start as a one-line strip that expands on tap — used on short screens so
   * the card never pushes the sign-in form below the fold. */
  collapsible?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(!collapsible);
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const age = ageFromDob(snapshot.dob);
  const contact = snapshot.contact;
  const phone = contact?.phone?.replace(/[^\d+]/g, '') ?? '';

  return (
    <View style={s.card} accessibilityRole="summary" accessibilityLabel={t('authRedesign.medicalId.title')}>
      {collapsible ? (
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={t('authRedesign.medicalId.title')}
          activeOpacity={0.8}
          style={[s.head, s.headTap]}
        >
          <Icon name="first-aid" size={16} color="#FFFFFF" />
          <Text style={[s.headText, { flex: 1 }]} numberOfLines={1}>
            {t('authRedesign.medicalId.title')}
            {snapshot.bloodGroup ? `  ·  ${snapshot.bloodGroup}` : ''}
          </Text>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#FFFFFF" />
        </TouchableOpacity>
      ) : (
        <View style={s.head}>
          <Icon name="first-aid" size={16} color="#FFFFFF" />
          <Text style={s.headText}>{t('authRedesign.medicalId.title')}</Text>
        </View>
      )}

      {expanded ? (
      <View style={s.body}>
        <View style={s.stats}>
          {snapshot.bloodGroup ? (
            <Stat s={s} label={t('authRedesign.medicalId.bloodGroup')} value={snapshot.bloodGroup} strong />
          ) : null}
          {age !== null ? (
            <Stat s={s} label={t('authRedesign.medicalId.age')} value={t('authRedesign.medicalId.ageValue', { count: age })} />
          ) : null}
          <Stat s={s} label={t('authRedesign.medicalId.healthId')} value={snapshot.healthId} mono />
        </View>

        {snapshot.allergies !== null ? (
          <View style={s.block}>
            <Text style={s.label}>{t('authRedesign.medicalId.allergies')}</Text>
            {snapshot.allergies.length === 0 ? (
              <Text style={s.value}>{t('authRedesign.medicalId.noAllergiesListed')}</Text>
            ) : (
              <View style={s.chips}>
                {snapshot.allergies.map((a, i) => (
                  <View key={`${a.name}-${i}`} style={s.chip}>
                    <Icon name="alert-triangle" size={12} color={colors.statusCritical} />
                    <Text style={s.chipText}>
                      {a.name}
                      {a.severity ? <Text style={s.chipSev}> · {a.severity}</Text> : null}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {contact ? (
          <View style={s.contactRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{t('authRedesign.medicalId.contact')}</Text>
              <Text style={s.value} numberOfLines={1}>
                {contact.name}
                {contact.relationship ? <Text style={s.muted}> · {contact.relationship}</Text> : null}
              </Text>
              {contact.phone ? <Text style={s.muted}>{contact.phone}</Text> : null}
            </View>
            {phone ? (
              <TouchableOpacity
                onPress={() => void Linking.openURL(`tel:${phone}`).catch(() => undefined)}
                accessibilityRole="button"
                accessibilityLabel={t('authRedesign.medicalId.call', { name: contact.name })}
                accessibilityHint={t('authRedesign.medicalId.callHint')}
                style={s.call}
                hitSlop={8}
              >
                <Icon name="phone" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <Text style={s.foot}>{t('authRedesign.medicalId.subtitle')}</Text>
      </View>
      ) : null}
    </View>
  );
}

function Stat({
  s,
  label,
  value,
  strong,
  mono,
}: {
  s: ReturnType<typeof makeStyles>;
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <View style={s.stat}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, strong && s.strong, mono && s.mono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      width: '100%',
      borderRadius: radii.lg,
      overflow: 'hidden',
      backgroundColor: c.surface,
      borderWidth: 1.5,
      borderColor: c.statusCritical,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.statusCritical,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
    },
    headTap: { minHeight: 44 },
    headText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: '#FFFFFF',
    },
    body: { padding: spacing.md, gap: spacing.sm + 2 },
    stats: { flexDirection: 'row', gap: spacing.md },
    stat: { flexShrink: 1 },
    block: { gap: 4 },
    label: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    value: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    strong: { fontSize: typography.size.lg, color: c.statusCritical },
    mono: { letterSpacing: 0.6 },
    muted: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.statusCriticalBg,
      borderRadius: radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    chipText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textPrimary,
    },
    chipSev: { fontFamily: typography.fontFamily.regular, color: c.textSecondary },
    contactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.divider,
      paddingTop: spacing.sm,
    },
    call: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.statusNormal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    foot: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      color: c.textMuted,
    },
  });
