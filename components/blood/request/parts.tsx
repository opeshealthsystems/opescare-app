import { Fragment, useMemo } from 'react';
import {
  StyleProp,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { useTranslation } from 'react-i18next';

import {
  Card,
  EmptyState,
  Icon,
  StepProgress,
  useTheme,
  type IconName,
  type Step,
} from '@/components/opes-ui';
import { CareButton, NoticeBanner } from '@/components/care/shared';

import { FieldTone, dial, SubmitFailure } from './helpers';
import { makeStyles } from './styles';
/** Split verbatim out of app/blood-finder/request.tsx. */

/** One option in an inline dropdown. */
export type Option = {
  key: string;
  label: string;
  sub?: string;
  icon?: IconName;
  tone?: FieldTone;
};

/** One cell of the bordered summary / stat grid. */
export type Fact = {
  key: string;
  icon: IconName;
  label: string;
  value: string;
  sub?: string | null;
  valueColor?: string;
};

/**
 * PM-BLOOD-03's 2-step strip: a numbered circle with its label BESIDE it and a
 * rule between the two steps. The kit's `StepProgress` stacks its labels under
 * 44pt circles and is built for three-plus stops — it stays in this file for
 * the request lifecycle on the confirmed screen, where that shape is right.
 */
export function WizardSteps({
  steps,
  currentIndex,
  accessibilityLabel,
}: {
  steps: Step[];
  currentIndex: number;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View
      style={styles.wizard}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 1, max: steps.length, now: currentIndex + 1 }}
    >
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        return (
          <Fragment key={step.key}>
            {index > 0 ? <View style={[styles.wizardRule, done && styles.wizardRuleDone]} /> : null}
            <View style={styles.wizardStep}>
              <View style={[styles.wizardCircle, (current || done) && styles.wizardCircleOn]}>
                {done ? (
                  <Icon name="check" size={14} color={colors.textOnBrand} />
                ) : (
                  <Text style={[styles.wizardNumber, current && styles.wizardNumberOn]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[styles.wizardLabel, (current || done) && styles.wizardLabelOn]}
                numberOfLines={2}
              >
                {step.label}
              </Text>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

/**
 * The reference's labelled field box: caption above, bordered box below with a
 * leading glyph, the value, and a trailing affordance.
 *
 * `trailing` is load-bearing, not decoration:
 *   · `chevron-down` — pressing this opens a list of choices, here, now.
 *   · `edit`         — the value is owned by another screen; pressing goes there.
 *   · `none`         — read-only.
 */
export function SelectField({
  label,
  icon,
  iconColor,
  value,
  tone = 'default',
  muted,
  trailing = 'chevron-down',
  open,
  onPress,
  accessibilityHint,
  style,
}: {
  label: string;
  icon: IconName;
  iconColor?: string;
  value: string;
  tone?: FieldTone;
  /** Paint the value as a placeholder (nothing chosen yet). */
  muted?: boolean;
  trailing?: 'chevron-down' | 'edit' | 'none';
  open?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const accent =
    tone === 'critical' ? colors.statusCritical : tone === 'warning' ? colors.statusWarning : null;
  const boxTint = accent
    ? {
        borderColor: accent,
        backgroundColor: tone === 'critical' ? colors.statusCriticalBg : colors.statusWarningBg,
      }
    : null;
  const valueColor = accent ?? (muted ? colors.textMuted : colors.textPrimary);

  return (
    <View style={style}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.75}
        style={[styles.fieldBox, boxTint, open && styles.fieldBoxOpen]}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={`${label}: ${value}`}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ expanded: open }}
      >
        <Icon name={icon} size={18} color={iconColor ?? accent ?? colors.link} />
        <Text style={[styles.fieldValue, { color: valueColor }]} numberOfLines={1}>
          {value}
        </Text>
        {trailing === 'none' ? null : (
          <Icon
            name={trailing === 'edit' ? 'pencil' : open ? 'chevron-up' : 'chevron-down'}
            size={trailing === 'edit' ? 14 : 16}
            color={accent ?? colors.textMuted}
          />
        )}
      </TouchableOpacity>
    </View>
  );
}

/** A `SelectField` that actually opens: the option list expands beneath it. */
export function DropdownField({
  label,
  icon,
  value,
  tone,
  muted,
  options,
  selectedKey,
  open,
  onToggle,
  onSelect,
  style,
}: {
  label: string;
  icon: IconName;
  value: string;
  tone?: FieldTone;
  muted?: boolean;
  options: Option[];
  selectedKey: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={style}>
      <SelectField
        label={label}
        icon={icon}
        value={value}
        tone={tone}
        muted={muted}
        open={open}
        onPress={onToggle}
        accessibilityHint={t('bloodFinder.request.chooseOption', {
          defaultValue: 'Opens the list of choices',
        })}
      />
      {open ? (
        <View style={styles.menu} accessibilityRole="radiogroup">
          {options.map((option, index) => {
            const selected = option.key === selectedKey;
            const accent =
              option.tone === 'critical'
                ? colors.statusCritical
                : option.tone === 'warning'
                  ? colors.statusWarning
                  : colors.textPrimary;
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => onSelect(option.key)}
                activeOpacity={0.75}
                style={[styles.menuItem, index < options.length - 1 && styles.menuItemDivider]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.sub ? `${option.label}. ${option.sub}` : option.label}
              >
                {option.icon ? <Icon name={option.icon} size={18} color={accent} /> : null}
                <View style={styles.menuItemText}>
                  <Text style={[styles.menuLabel, { color: accent }]}>{option.label}</Text>
                  {option.sub ? <Text style={styles.menuSub}>{option.sub}</Text> : null}
                </View>
                {selected ? (
                  <Icon name="check-circle" size={18} color={colors.link} />
                ) : (
                  <View style={styles.radio} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One contact-preference tile. The reference lays icon, label and radio in a
 * row; at 375pt three of those across leaves ~98pt each, so the radio moves up
 * beside the icon and the label takes the full width underneath.
 */
export function RadioTile({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.tile, selected && styles.tileOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <View style={styles.tileTop}>
        <Icon name={icon} size={18} color={selected ? colors.link : colors.textSecondary} />
        {selected ? (
          <Icon name="check-circle" size={18} color={colors.link} />
        ) : (
          <View style={styles.radio} />
        )}
      </View>
      <Text style={[styles.tileLabel, selected && styles.tileLabelOn]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * The reference's bordered fact grid — used by the review step and by both
 * grids on PM-BLOOD-04. Two columns at phone width (the references draw four),
 * with the same hairline rules between the cells.
 */
export function FactGrid({ facts, columns = 2 }: { facts: Fact[]; columns?: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const lastRowStart = Math.floor((facts.length - 1) / columns) * columns;
  // At three or four across a cell is ~72pt. The label stops sitting beside
  // its icon and starts sitting under it, over two lines if it needs them.
  const tight = columns >= 3;

  return (
    <View style={styles.grid}>
      {facts.map((fact, index) => (
        <View
          key={fact.key}
          style={[
            styles.gridCell,
            tight && styles.gridCellTight,
            { width: `${100 / columns}%` },
            // A rule only where there is actually a cell on the other side of
            // it — an odd last row must not trail a hairline into empty space.
            (index + 1) % columns !== 0 && index + 1 < facts.length && styles.gridCellRule,
            index < lastRowStart && styles.gridCellRuleBottom,
          ]}
          accessible
          accessibilityLabel={`${fact.label}: ${fact.value}${fact.sub ? `. ${fact.sub}` : ''}`}
        >
          <View style={[styles.gridHead, tight && styles.gridHeadTight]}>
            <Icon name={fact.icon} size={tight ? 13 : 14} color={colors.textMuted} />
            <Text style={styles.gridLabel} numberOfLines={2}>
              {fact.label}
            </Text>
          </View>
          <Text
            style={[
              styles.gridValue,
              tight && styles.gridValueTight,
              !!fact.valueColor && { color: fact.valueColor },
            ]}
            numberOfLines={2}
          >
            {fact.value}
          </Text>
          {fact.sub ? (
            <Text style={styles.gridSub} numberOfLines={2}>
              {fact.sub}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** A dot and a line of instruction. */
export function Bullet({ text }: { text: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

/** One square action tile from PM-BLOOD-04's bottom row. */
export function ActionTile({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
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
      style={[styles.actionTile, disabled && styles.actionTileOff]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Icon name={icon} size={20} color={disabled ? colors.textMuted : colors.link} />
      <Text
        style={[styles.actionTileLabel, disabled && styles.actionTileLabelOff]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Square tap target for the units stepper. */
export function StepperButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.stepperButton, disabled && styles.stepperButtonOff]}
    >
      <Icon name={icon} size={18} color={colors.link} />
    </TouchableOpacity>
  );
}

/* ── Failure panels ───────────────────────────────────────────────────────── */

/**
 * One panel per failure, because they are not one failure.
 *
 *  - not_available  (409) the stock went between the search and the send
 *  - facility_missing (404) the listing itself is gone
 *  - too_many       (429) five open requests already — the ceiling, not a fault
 *  - duplicate      (409) this exact request is already open at this facility
 *  - validation     (422) a field the server refused — shown verbatim
 *  - network        nothing was sent; retrying is the correct move
 *  - generic        an unknown refusal, named as unknown rather than guessed
 */
export function FailurePanel({
  failure,
  group,
  component,
  phone,
  onBack,
}: {
  failure: SubmitFailure;
  group: string;
  component: string;
  phone: string | null;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (failure.kind === 'not_available') {
    return <NotAvailablePanel group={group} component={component} phone={phone} onBack={onBack} />;
  }

  if (failure.kind === 'facility_missing') {
    return (
      <View style={styles.stack}>
        <Card variant="flush">
          <EmptyState
            icon="alert-circle"
            tint="red"
            title={t('bloodFinder.errors.FACILITY_NOT_FOUND')}
            message={t('bloodFinder.request.facilityMissingHint', {
              defaultValue:
                'The facility was removed from the OpesCare directory after your search ran, so nothing can be reserved there. Search again to see who else reports this blood.',
            })}
            actionLabel={t('bloodFinder.request.backToSearch')}
            onAction={onBack}
          />
        </Card>
        {phone ? (
          <CareButton
            label={t('bloodFinder.request.callNow')}
            icon="phone"
            variant="secondary"
            onPress={() => dial(phone)}
          />
        ) : null}
      </View>
    );
  }

  if (failure.kind === 'too_many') {
    return (
      <Card variant="flush">
        <EmptyState
          icon="alert-circle"
          tint="amber"
          title={t('bloodFinder.errors.TOO_MANY_OPEN_REQUESTS')}
          message={`${t('bloodFinder.request.openRequestsHint')}\n\n${t(
            'bloodFinder.request.tooManyHint',
            {
              defaultValue:
                'Cancel one you no longer need, or wait — an unanswered request lapses on its own after 24 hours and frees the slot.',
            },
          )}`}
          actionLabel={t('bloodFinder.myRequests')}
          onAction={onBack}
        />
      </Card>
    );
  }

  if (failure.kind === 'duplicate') {
    return (
      <Card variant="flush">
        <EmptyState
          icon="receipt"
          tint="blue"
          title={t('bloodFinder.errors.REQUEST_ALREADY_OPEN')}
          message={`${t('bloodFinder.request.duplicateHint', {
            defaultValue:
              'Sending it twice would not make the blood bank answer sooner. The request you already sent is still open.',
          })}\n\n${t('bloodFinder.request.openRequestsHint')}`}
          actionLabel={t('bloodFinder.myRequests')}
          onAction={onBack}
        />
      </Card>
    );
  }

  if (failure.kind === 'network') {
    return (
      <Card variant="flush">
        <EmptyState
          icon="alert-circle"
          tint="amber"
          title={t('bloodFinder.request.networkTitle', {
            defaultValue: "Your request didn't reach OpesCare.",
          })}
          // No retry button here on purpose: the "Send Request" button is still
          // on screen directly below, and two buttons that fire the same POST
          // is one too many to reason about while frightened.
          message={t('bloodFinder.request.networkBody', {
            defaultValue:
              'Nothing was sent and nothing was reserved. Check your connection and send it again — or call the facility, which does not need the internet.',
          })}
          actionLabel={phone ? t('bloodFinder.request.callNow') : undefined}
          onAction={phone ? () => dial(phone) : undefined}
        />
      </Card>
    );
  }

  // validation | generic
  return (
    <View style={styles.stack}>
      <NoticeBanner
        icon="alert-circle"
        tone="critical"
        title={t('bloodFinder.request.title')}
        message={
          failure.code
            ? t(`bloodFinder.errors.${failure.code}`, {
                defaultValue: t('bloodFinder.errors.generic'),
              })
            : t('bloodFinder.errors.generic')
        }
      />
      {failure.detail ? <Text style={styles.footnote}>{failure.detail}</Text> : null}
    </View>
  );
}

/**
 * The 409. `blood_availability` is self-reported, so a listing going away
 * between the search and the send is ordinary — this panel treats it as a fork
 * in the road rather than a failure, and every button on it does something.
 * Deliberately offers no "try again": the same POST would be refused by the
 * same availability check for the same reason.
 */
export function NotAvailablePanel({
  group,
  component,
  phone,
  onBack,
}: {
  group: string;
  component: string;
  phone: string | null;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.stack}>
      <Card variant="flush">
        <EmptyState
          icon="alert-circle"
          tint="red"
          title={t('bloodFinder.request.notAvailableTitle')}
          message={`${t('bloodFinder.request.notAvailableBody', { group, component })}\n\n${t(
            'bloodFinder.empty.body',
          )}`}
          actionLabel={t('bloodFinder.request.backToSearch')}
          onAction={onBack}
        />
      </Card>
      {phone ? (
        <CareButton
          label={t('bloodFinder.request.callNow')}
          icon="phone"
          variant="dangerSolid"
          onPress={() => dial(phone)}
        />
      ) : null}
      <Text style={styles.footnote}>{t('bloodFinder.noResultsHint')}</Text>
    </View>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────────── */

