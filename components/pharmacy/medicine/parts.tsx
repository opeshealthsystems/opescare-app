import { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleProp,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { useTranslation } from 'react-i18next';
import {
  Card,
  Icon,
  StatusBadge,
  useTheme,
  type IconName,
} from '@/components/opes-ui';
import { MedButton } from '@/components/meds/shared';

import { type Medicine, type NearbyPharmacy, type StockStatusValue } from '@/lib/api/queries';
import { formatXafBare } from '@/lib/api/pharmacyQueries';
import {
  CATEGORY_ICONS,
  stockTone,
  money,
  verificationLine,
  hoursLine,
  freshness,
  callablePhone,
} from './helpers';
import { makeStyles } from './styles';
/** Split verbatim out of app/pharmacy/[medicineId].tsx. */

/** MED-03's "Why prices may vary" marks. */
export const WHY_ICONS: Record<'brand' | 'pack' | 'costs' | 'demand', IconName> = {
  brand: 'building',
  pack: 'cart',
  costs: 'wallet',
  demand: 'bar-chart',
};

/** MED-04's four steps, in order. */
export const HOW_ICONS: Record<'search' | 'compare' | 'reserve' | 'collect', IconName> = {
  search: 'search',
  compare: 'columns',
  reserve: 'cart',
  collect: 'store',
};

/* ── Pieces ───────────────────────────────────────────────────────────────── */

/**
 * The medicine card at the top of MED-02 / MED-03 / MED-04: product mark,
 * name, "Generic: …", indication tag pills and the prescription line, with
 * availability / price range / typical pack size underneath.
 *
 * The render's product PHOTOGRAPH has no payload behind it — `Medicine`
 * carries no image field — so the slot holds a tinted category mark.
 *
 * The render puts availability, price range and pack size in a right-hand
 * column. At 375pt that column would leave the drug name about 90px, and drug
 * names in this catalogue are not safely truncatable: `Coagulation Factor IX
 * 500 IU Powder for Injection` and `Coagulation Factor VIII 250 IU Powder for
 * Injection` clip to the same string. So the column becomes a tier.
 */
export function IdentityCard({ medicine }: { medicine: Medicine }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { price_min: min, price_max: max, currency, pharmacy_count: count, is_available } =
    medicine.availability;

  // See the header note: with no reporting pharmacy behind it, this range is
  // the catalogue's own reference price, not a quote — so it is labelled as
  // such rather than presented as what somebody charges.
  const reportedPrice = count > 0;
  const priceLabel =
    min === null && max === null
      ? null
      : min !== null && max !== null && min !== max
        ? t('pharmacy.priceRangeValue', { min: formatXafBare(min), max: money(max, currency) })
        : money(min ?? max, currency);

  const strengthForm =
    medicine.strength && medicine.form
      ? t('pharmacy.strengthForm', { strength: medicine.strength, form: medicine.form })
      : (medicine.strength ?? medicine.form ?? null);

  const sameAsName = (value: string | null) =>
    !!value && value.trim().toLowerCase() === medicine.name.trim().toLowerCase();

  const rx = medicine.prescription_required;
  // The render's three tag pills are the medicine's own `indications`. When
  // the catalogue carries none the card simply has no tags — nothing is
  // synthesised from the category to fill the row.
  const tags = (medicine.indications ?? []).slice(0, 3);

  return (
    <Card style={is_available ? styles.identityCardAvailable : undefined}>
      <View style={styles.identity}>
        <View
          style={[
            styles.identityShot,
            {
              backgroundColor: medicine.is_controlled ? colors.tintAmberBg : colors.tintGreenBg,
            },
          ]}
        >
          <Icon
            name={CATEGORY_ICONS[medicine.category_icon] ?? 'pill'}
            size={38}
            color={medicine.is_controlled ? colors.tintAmber : colors.tintGreen}
          />
        </View>

        <View style={styles.identityBody}>
          <Text style={styles.drugName} numberOfLines={3}>
            {medicine.name}
          </Text>
          {medicine.generic_name && !sameAsName(medicine.generic_name) ? (
            <Text style={styles.drugForm}>
              {t('pharmacy.generic', { name: medicine.generic_name })}
            </Text>
          ) : null}
          {medicine.brand_name && !sameAsName(medicine.brand_name) ? (
            <Text style={styles.drugForm}>
              {t('pharmacy.brand', { name: medicine.brand_name, defaultValue: 'Brand: {{name}}' })}
            </Text>
          ) : null}
          {strengthForm ? <Text style={styles.drugForm}>{strengthForm}</Text> : null}

          {tags.length > 0 ? (
            <View style={styles.tagRow}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText} numberOfLines={1}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* The render's tick + "Prescription not required" line. */}
          <View style={styles.rxLine}>
            <Icon
              name={rx ? 'alert-circle' : 'check-circle'}
              size={16}
              color={rx ? colors.statusWarning : colors.statusNormal}
            />
            <Text
              style={[styles.rxLineText, { color: rx ? colors.statusWarning : colors.statusNormal }]}
            >
              {rx ? t('pharmacy.prescriptionRequired') : t('pharmacy.prescriptionNotRequired')}
            </Text>
            {medicine.is_controlled ? (
              <StatusBadge
                status="controlled"
                tone="warning"
                label={t('pharmacy.controlled')}
                size="sm"
              />
            ) : null}
          </View>
        </View>
      </View>

      {/* The render's right-hand column, carried as a tier at 375pt. */}
      <View style={styles.identityFoot}>
        <View style={styles.identityFootCell}>
          <View style={styles.identityFootHead}>
            <Icon
              name={is_available ? 'check-circle' : 'info'}
              size={14}
              color={is_available ? colors.statusNormal : colors.textMuted}
            />
            <Text style={styles.identityFootLabel} numberOfLines={1}>
              {t('pharmacy.pricingStock')}
            </Text>
          </View>
          <Text
            style={[
              styles.identityFootValue,
              { color: is_available ? colors.statusNormal : colors.textMuted },
            ]}
            numberOfLines={3}
          >
            {is_available
              ? t('pharmacy.pharmacyCount', { count })
              : t('pharmacy.notReported', { defaultValue: 'Not reported' })}
          </Text>
        </View>

        {/* Omitted entirely when the catalogue carries no price at all —
            a labelled blank teaches nothing. */}
        {priceLabel ? (
          <View style={[styles.identityFootCell, styles.identityFootCellDivided]}>
            <Text style={styles.identityFootLabel} numberOfLines={1}>
              {reportedPrice
                ? t('pharmacy.priceRange')
                : t('pharmacy.priceIndicative', { defaultValue: 'Catalogue price' })}
            </Text>
            <Text style={styles.identityFootPrice} numberOfLines={2}>
              {priceLabel}
            </Text>
          </View>
        ) : null}

        {medicine.default_pack_size ? (
          <View style={[styles.identityFootCell, styles.identityFootCellDivided]}>
            <Text style={styles.identityFootLabel} numberOfLines={1}>
              {t('pharmacy.packSizeLabel', { defaultValue: 'Pack size' })}
            </Text>
            <Text style={styles.identityFootValue} numberOfLines={2}>
              {medicine.default_pack_size}
            </Text>
          </View>
        ) : null}
      </View>

      {/* The national figure needs its scope said out loud, once. */}
      <Text style={styles.identityFootnote}>
        {t('pharmacy.catalogueScopeHint', {
          defaultValue:
            'Availability counts every pharmacy in the national directory that reports stock — not only those near you.',
        })}
      </Text>
    </Card>
  );
}

/**
 * One stocking pharmacy, drawn as the MED-02 row: mark on the left, name with
 * a Verified pill, distance and hours, the stock line and the price — and the
 * render's stacked column of three actions.
 *
 * ── Where this departs from the render, and why ────────────────────────────
 *  • The actions sit UNDER the row, not beside it: a mark, a wrapping
 *    pharmacy name and a 130pt button column do not fit in 343pt.
 *  • The render's PHOTO has no payload behind it — `NearbyPharmacy` carries no
 *    image field — so the slot holds a tinted storefront mark.
 *  • The render turns an out-of-stock row's first button into "Notify Me".
 *    There is no back-in-stock subscription anywhere in this API, so that
 *    button would do nothing; instead the primary goes dead and says what is
 *    actually true — the pharmacy cannot hold this right now.
 *  • The render also GREYS OUT Directions and Call on an out-of-stock row.
 *    Those two still work, and still help — ringing a pharmacy that reported
 *    zero packs yesterday is exactly what a patient should do — so they stay
 *    live. Disabling a working control to match a picture is a regression.
 *  • `last_reported_at` stays on every row, always, never traded away for the
 *    pack count: a pack count is not a substitute for a date.
 */
export function PharmacyOptionRow({
  pharmacy,
  selected,
  divider,
  onSelect,
  onCall,
}: {
  pharmacy: NearbyPharmacy;
  selected: boolean;
  divider: boolean;
  onSelect: () => void;
  onCall: (phone: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const stock = pharmacy.stock;
  const price = money(stock?.unit_price, stock?.currency);
  const stockLabel = stock
    ? t(`pharmacy.stock.${stock.status}`, { defaultValue: stock.status_label })
    : t('pharmacy.stock.unknown');
  const fresh = freshness(stock, t);
  const phone = callablePhone(pharmacy.phone);
  const mappable = pharmacy.latitude != null && pharmacy.longitude != null;
  const reservable = !!stock?.reservation_enabled;

  const packs =
    stock?.packs_available !== null && stock?.packs_available !== undefined
      ? t('pharmacy.packsLeft', { count: stock.packs_available })
      : null;

  const distanceHours = [
    t('pharmacy.distanceKm', { km: pharmacy.distance_km }),
    hoursLine(pharmacy, t),
  ]
    .filter(Boolean)
    .join('  •  ');

  const verified = verificationLine(pharmacy.verification_status, t);

  return (
    <TouchableOpacity
      onPress={onSelect}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={[pharmacy.name, verified, stockLabel, price, distanceHours, fresh.line]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={selected ? t('pharmacy.selectedPharmacy') : t('pharmacy.reserveHere')}
      style={[styles.stockRow, selected && styles.selectedRow, divider && styles.stockRowDivider]}
    >
      <View style={styles.stockHead}>
        {/* Storefront mark — the render's photo has no payload behind it. */}
        <View
          style={[
            styles.stockShot,
            { backgroundColor: selected ? colors.tintGreenBg : colors.tintBlueBg },
          ]}
        >
          <Icon
            name={selected ? 'check' : 'store'}
            size={24}
            color={selected ? colors.tintGreen : colors.tintBlue}
          />
        </View>

        <View style={styles.stockBody}>
          <View style={styles.stockTitleRow}>
            <Text style={styles.stockName} numberOfLines={2}>
              {pharmacy.name}
            </Text>
            {verified ? (
              <StatusBadge
                status={pharmacy.verification_status ?? 'unknown'}
                tone={verified === t('pharmacy.verified') ? 'normal' : 'neutral'}
                icon={verified === t('pharmacy.verified') ? 'shield-check' : undefined}
                label={
                  verified === t('pharmacy.verified')
                    ? t('pharmacy.verifiedShort')
                    : t('pharmacy.notVerified')
                }
                size="sm"
              />
            ) : null}
          </View>

          <Text style={styles.stockMeta} numberOfLines={1}>
            {distanceHours}
          </Text>

          <View style={styles.stockStatusRow}>
            <StatusBadge
              status={stock?.status ?? 'unknown'}
              tone={stockTone(stock?.status)}
              label={stockLabel}
              size="sm"
            />
            {packs || stock?.pack_size ? (
              <Text style={styles.stockMeta} numberOfLines={1}>
                {[packs, stock?.pack_size].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>

          {price ? (
            <Text style={styles.stockPrice} numberOfLines={1}>
              {price}
            </Text>
          ) : null}

          <Text
            style={[styles.stockMeta, fresh.stale && { color: colors.statusWarning }]}
            numberOfLines={1}
          >
            {fresh.stale
              ? `${fresh.line} · ${t('pharmacy.stockOld', { defaultValue: 'Old report' })}`
              : fresh.line}
          </Text>
        </View>
      </View>

      {/* The render's stacked action column, carried under the row at 375pt.
          The primary says what is actually true here: "Reserve" while a hold
          can be placed, "Selected" once this is the chosen counter, and the
          stock status when the shelf is empty. */}
      <View style={styles.stockActions}>
        <AccentButton
          label={
            selected
              ? t('pharmacy.selectedPharmacy')
              : reservable
                ? t('pharmacy.reserveShort')
                : stock?.status === 'out_of_stock'
                  ? stockLabel
                  : t('pharmacy.reserveShort')
          }
          icon={selected ? 'check' : reservable ? 'cart' : 'alert-circle'}
          variant={reservable && !selected ? 'solid' : 'outline'}
          disabled={!reservable}
          onPress={onSelect}
        />
        <AccentButton
          label={t('pharmacy.getDirections')}
          icon="send"
          variant="outline"
          disabled={!mappable}
          onPress={onSelect}
        />
        <AccentButton
          label={t('pharmacy.callPharmacy')}
          icon="phone"
          variant="outline"
          disabled={!phone}
          onPress={() => phone && onCall(phone)}
        />
      </View>
    </TouchableOpacity>
  );
}

/**
 * The screen's green accent button, in the render's two weights: a solid green
 * primary and a white outlined secondary.
 *
 * Local rather than the kit `GradientButton` / `MedButton` because both paint
 * themselves in the brand blue, and green is the medicine accent across all
 * four MED renders. Tokens still come from the theme.
 */
export function AccentButton({
  label,
  icon,
  variant = 'solid',
  disabled,
  loading,
  onPress,
  style,
  accessibilityHint,
}: {
  label: string;
  icon?: IconName;
  variant?: 'solid' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const off = !!disabled || !!loading;
  const fg = variant === 'solid' ? colors.textOnBrand : colors.textPrimary;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off }}
      style={[
        styles.accentButton,
        variant === 'solid'
          ? { backgroundColor: colors.statusNormal, borderColor: colors.statusNormal }
          : { backgroundColor: colors.surface, borderColor: colors.border },
        off && styles.accentButtonOff,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? (
            <Icon
              name={icon}
              size={16}
              color={variant === 'solid' ? fg : colors.statusNormal}
            />
          ) : null}
          <Text style={[styles.accentButtonText, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/**
 * MED-03 draws a progress bar beside "In Stock". Nothing in this API reports a
 * pharmacy's shelf CAPACITY, so a filled fraction would be a fabricated
 * denominator. These three segments encode the reported STATUS instead —
 * in stock / low stock / out of stock — and never a quantity. The pack count,
 * where the pharmacy gave one, is printed as a number underneath.
 */
export function StockMeter({ status }: { status: StockStatusValue }) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const filled = status === 'in_stock' ? 3 : status === 'low_stock' ? 1 : 0;
  const fg = statusMap[stockTone(status)].fg;

  return (
    <View style={styles.meter} importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[styles.meterSegment, { backgroundColor: i < filled ? fg : colors.divider }]}
        />
      ))}
    </View>
  );
}

/** One column of MED-03's Form / Strength / Category table. */
export function TableCell({ label, value, divided }: { label: string; value: string; divided?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View
      style={[styles.tableCell, divided && styles.tableCellDivided]}
      accessible
      accessibilityLabel={`${label}, ${value}`}
    >
      <Text style={styles.tableLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.tableValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/** Tinted one-liner used for cautions that are not errors. */
export function NoticeStrip({
  icon,
  tone,
  text,
}: {
  icon: IconName;
  tone: 'warning' | 'info';
  text: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bg = tone === 'warning' ? colors.statusWarningBg : colors.primarySoft;
  const fg = tone === 'warning' ? colors.statusWarning : colors.blue;
  return (
    <View style={[styles.strip, { backgroundColor: bg }]} accessibilityRole="summary">
      <Icon name={icon} size={18} color={fg} />
      <Text style={styles.stripText}>{text}</Text>
    </View>
  );
}

export function StepperButton({
  icon,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[styles.stepperButton, disabled && styles.stepperButtonOff]}
    >
      <Icon name={icon} size={18} color={colors.blue} />
    </TouchableOpacity>
  );
}

export function SummaryLine({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.summaryLine} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={styles.summaryLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.summaryValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────────── */

