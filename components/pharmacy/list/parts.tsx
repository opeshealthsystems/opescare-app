import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useTranslation } from 'react-i18next';
import {
  Card,
  Icon,
  ListRow,
  StatusBadge,
  formatDateTime,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import { MedButton, TintCircle } from '@/components/meds/shared';

import { type Medicine, type MedicineReservation, type NearbyPharmacy } from '@/lib/api/queries';

import {
  CATEGORY_ICONS,
  TintKey,
  VERIFIED_STATUSES,
  UNVERIFIED_STATUSES,
  RESERVATION_TONES,
  money,
  priceQuote,
  strengthForm,
  callablePhone,
} from './helpers';
import { CatalogImage } from '@/components/ui/CatalogImage';
import { radii } from '@/components/opes-ui/theme';
import { makeStyles } from './styles';
/** Split verbatim out of app/pharmacy.tsx. */

/**
 * The render's big rounded search field: magnifier, field, clear button.
 *
 * Local rather than the kit `PillInput` because that control wraps its icon in
 * the hexagon badge from the login screens, which MED-01 does not draw. Every
 * colour and token still comes from the theme.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  clearLabel,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  clearLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.search, focused && { borderColor: colors.borderFocus }]}>
      <Icon name="search" size={20} color={focused ? colors.blue : colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={placeholder}
        style={styles.searchInput}
      />
      {value.length > 0 ? (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={10}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
        >
          <Icon name="x-circle" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * One of the render's outlined dropdown pills: icon, current value, chevron.
 *
 * Not the kit `Chip` — a chip is a filled on/off toggle, and MED-01 draws
 * these as white bordered controls that OPEN something. The chevron flips to
 * `chevron-up` while its panel is open so the pill says which one is showing.
 */
export function DropPill({
  icon,
  label,
  open,
  count,
  chevron = true,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  label: string;
  open: boolean;
  count?: number;
  chevron?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fg = open ? colors.blue : colors.textSecondary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: open }}
      style={[styles.dropPill, open && { borderColor: colors.blue, backgroundColor: colors.primarySoft }]}
    >
      <Icon name={icon} size={15} color={fg} />
      <Text style={[styles.dropPillText, open && { color: colors.blue }]} numberOfLines={1}>
        {label}
      </Text>
      {count ? (
        <View style={styles.dropPillCount}>
          <Text style={styles.dropPillCountText}>{count}</Text>
        </View>
      ) : null}
      {chevron ? (
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      ) : null}
    </TouchableOpacity>
  );
}

/**
 * One tile of the reference's category rail (MED-01).
 *
 * The image draws these as boxed icon-over-label tiles rather than text chips,
 * and the rail is the most recognisable thing on the Medicine Finder. The
 * count rides in the corner so a category with nothing in it is visibly empty
 * instead of silently returning no results.
 */
export function CategoryTile({
  icon,
  label,
  count,
  tint,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  count?: number;
  /** Palette key for this category's colour; omitted by the "All" tile. */
  tint?: TintKey;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const stroke = tint ? colors[tint] : colors.blue;
  const fill = tint ? colors[`${tint}Bg` as keyof typeof colors] : colors.primarySoft;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      style={[
        styles.catTile,
        {
          borderColor: selected ? stroke : colors.border,
          backgroundColor: selected ? fill : colors.surface,
        },
      ]}
    >
      <View style={styles.catMark}>
        <Icon name={icon} size={24} color={stroke} />
      </View>
      <Text
        style={[styles.catLabel, selected && { color: colors.textPrimary }]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {count !== undefined ? <Text style={styles.catCount}>{count}</Text> : null}
    </TouchableOpacity>
  );
}

/** Bordered picker used by the city / radius sheets. */
export function OptionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card variant="flush">
      <Text style={styles.optionTitle}>{title}</Text>
      {children}
    </Card>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.loading} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.blue} />
      <Text style={styles.loadingText}>{label}</Text>
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

/**
 * One catalogue row, drawn as the MED-01 render's green-tinted medicine hero:
 * a product mark on the left, then name / "Generic: …" / indication tag pills /
 * the prescription line, with availability, price range and pack size below.
 *
 * ── What is NOT here, and why ─────────────────────────────────────────────
 * The render shows a photograph of the box. No medicine payload this app
 * receives carries an image of any kind (see `Medicine` in lib/api/queries.ts),
 * so the slot holds a tinted category mark rather than a stock photo of some
 * other manufacturer's packet.
 *
 * ── Why the render's right-hand column is a tier, not a column ─────────────
 * `ListRow` is a three-column layout — tint circle, flexible centre, trailing
 * block allowed up to 45 % of the row — and it clamps its title to one line.
 * This row's trailing block carried a price range, a "catalogue price" caption
 * and an availability badge, which at 375 px left the name about 90 px: nine
 * characters. `Acetazolamide 250mg Tablet` rendered as "Acetazola…".
 *
 * For a medicine that is not cosmetic. Across the live catalogue (419 rows,
 * `GET /mobile/pharmacy/medicines`) many names share their opening characters:
 * `Coagulation Factor IX 500 IU Powder for Injection` and `Coagulation Factor
 * VIII 250 IU Powder for Injection` clip to the *same* string, as do the three
 * `Ciprofloxacin` entries — 0.3 % ear drops, 0.3 % eye drops and the 500 mg
 * tablet. A clipped drug name is an ambiguous drug name.
 *
 * So the name takes the full width of the row and wraps, and everything that
 * was bidding against it — price, caption, availability badge — moves to a
 * second tier underneath where it has the whole row to spread across. Three
 * lines is the clamp: the longest name in the catalogue (`Rifampicin +
 * Isoniazid + Pyrazinamide + Ethambutol 150/75/400/275mg Tablet`, 74
 * characters) needs three at 375 px, so nothing in the live catalogue
 * truncates, while a hypothetical longer one still cannot run the row off the
 * screen.
 */
export function MedicineRow({
  medicine,
  divider,
  onPress,
}: {
  medicine: Medicine;
  divider: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { pharmacy_count: count, is_available: available } = medicine.availability;
  const quote = priceQuote(medicine, t);
  const dose = strengthForm(medicine, t);
  const rx = medicine.prescription_required;

  // The catalogue frequently repeats the generic as the display name; printing
  // "Generic: Paracetamol" under "Paracetamol" is noise, so it is dropped and
  // the brand takes the slot when there is one to show.
  const sameAsName = (value: string | null) =>
    !!value && value.trim().toLowerCase() === medicine.name.trim().toLowerCase();

  const identity =
    medicine.generic_name && !sameAsName(medicine.generic_name)
      ? t('pharmacy.generic', { name: medicine.generic_name })
      : medicine.brand_name && !sameAsName(medicine.brand_name)
        ? t('pharmacy.brand', { name: medicine.brand_name, defaultValue: 'Brand: {{name}}' })
        : null;

  // The render's three tag pills. These are the medicine's own `indications`;
  // when the catalogue carries none the row simply has no tags — nothing is
  // synthesised from the category to fill the space. Capped at three because
  // that is what fits on one line at 375pt.
  const tags = (medicine.indications ?? []).slice(0, 3);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={[
        medicine.name,
        identity,
        dose,
        rx ? t('pharmacy.prescriptionRequired') : t('pharmacy.prescriptionNotRequired'),
        medicine.is_controlled ? t('pharmacy.controlled') : null,
        quote?.label,
        available
          ? t('pharmacy.pharmacyCount', { count })
          : t('pharmacy.notReportedAnywhere', {
              defaultValue: 'No pharmacy has reported stock for this medicine.',
            }),
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={t('pharmacy.viewDetails')}
      style={[
        styles.medRow,
        // The render tints the hero card green. Here that tint carries the one
        // fact it is honest for it to carry: a pharmacy somewhere has reported
        // this medicine. Rows nobody has reported stay on the plain surface.
        available && styles.medRowAvailable,
        divider && styles.medRowDivider,
      ]}
    >
      <View style={styles.medHead}>
        {/* Product photo when the catalogue has one; otherwise the category mark. */}
        <CatalogImage
          uri={medicine.image_url}
          size={62}
          radius={radii.md}
          fallback={
            <View style={styles.medShot}>
              <Icon
                name={CATEGORY_ICONS[medicine.category_icon] ?? 'pill'}
                size={40}
                color={
                  medicine.is_controlled
                    ? colors.tintAmber
                    : available
                      ? colors.tintGreen
                      : colors.tintBlue
                }
              />
            </View>
          }
        />

        <View style={styles.medBody}>
          <Text style={styles.medName} numberOfLines={3}>
            {medicine.name}
          </Text>
          {identity ? (
            <Text style={styles.medMeta} numberOfLines={1}>
              {identity}
            </Text>
          ) : null}
          {dose ? (
            <Text style={styles.medMeta} numberOfLines={1}>
              {dose}
            </Text>
          ) : null}

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

          {/* The render's green tick + "Prescription not required" line. */}
          <View style={styles.rxLine}>
            <Icon
              name={rx ? 'alert-circle' : 'check-circle'}
              size={15}
              color={rx ? colors.statusWarning : colors.statusNormal}
            />
            <Text
              style={[
                styles.rxLineText,
                { color: rx ? colors.statusWarning : colors.statusNormal },
              ]}
              numberOfLines={2}
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

        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </View>

      {/* The render's right-hand column, carried as a full-width tier: the
          availability claim, the price range, the pack size. It wraps, so a
          long range and a long badge stack instead of clipping each other. */}
      <View style={styles.medFoot}>
        <View style={styles.medFootCell}>
          <View style={styles.medFootHead}>
            <Icon
              name={available ? 'check-circle' : 'info'}
              size={14}
              color={available ? colors.statusNormal : colors.textMuted}
            />
            <Text style={styles.medFootLabel} numberOfLines={1}>
              {t('pharmacy.pricingStock')}
            </Text>
          </View>
          <Text
            style={[
              styles.medFootValue,
              { color: available ? colors.statusNormal : colors.textMuted },
            ]}
            numberOfLines={2}
          >
            {available
              ? t('pharmacy.available')
              : t('pharmacy.notReported', { defaultValue: 'Not reported' })}
          </Text>
        </View>

        {quote ? (
          <View style={[styles.medFootCell, styles.medFootCellDivided]}>
            <Text style={styles.medFootLabel} numberOfLines={1}>
              {/* A figure nobody is charging must not look like a quote. */}
              {quote.reported
                ? t('pharmacy.priceRange')
                : t('pharmacy.priceIndicative', { defaultValue: 'Catalogue price' })}
            </Text>
            <Text style={styles.medFootPrice} numberOfLines={2}>
              {quote.label}
            </Text>
          </View>
        ) : null}

        {medicine.default_pack_size ? (
          <View style={[styles.medFootCell, styles.medFootCellDivided]}>
            <Text style={styles.medFootLabel} numberOfLines={1}>
              {t('pharmacy.packSizeLabel', { defaultValue: 'Pack size' })}
            </Text>
            <Text style={styles.medFootValue} numberOfLines={2}>
              {medicine.default_pack_size}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

/**
 * Directory row, drawn as the MED-01 render's pharmacy card: mark on the left,
 * then name with an Open / Closed pill beside it, the distance-and-hours line,
 * and a "View Details" outlined button.
 *
 * ── Two things the render draws that this row must not ────────────────────
 *  • The PHOTO. `NearbyPharmacy` carries no image field; a storefront picture
 *    would have to be invented. The slot holds a tinted mark instead.
 *  • The STOCK LINE and the PRICE PILL. This list is fetched without a
 *    `medicine_id`, and MedicineFinderService only loads stock rows when a
 *    medicine is supplied, so `stock` is always null here by construction.
 *    Per-medicine stock, price and the reserve action live on the detail
 *    screen. Nothing on this row claims anything about the shelf.
 */
export function PharmacyRow({
  pharmacy,
  divider,
  onPress,
}: {
  pharmacy: NearbyPharmacy;
  divider: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const openLabel = pharmacy.is_24_hours
    ? t('pharmacy.open24')
    : pharmacy.is_open === null
      ? t('pharmacy.hoursUnknown')
      : pharmacy.is_open
        ? t('pharmacy.open')
        : t('pharmacy.closed');

  const openTone: StatusTone = pharmacy.is_24_hours
    ? 'normal'
    : pharmacy.is_open === null
      ? 'neutral'
      : pharmacy.is_open
        ? 'normal'
        : 'critical';

  const hoursLine = pharmacy.is_24_hours
    ? null
    : pharmacy.is_open && pharmacy.closes_at
      ? t('pharmacy.closesAt', { time: pharmacy.closes_at })
      : !pharmacy.is_open && pharmacy.opens_at
        ? t('pharmacy.opensAt', { time: pharmacy.opens_at })
        : null;

  const verification = verificationLine(pharmacy.verification_status, t);
  // The street address already names the town on most rows; city/region is the
  // fallback for a listing that carries only an area.
  const place = pharmacy.address ?? ([pharmacy.city, pharmacy.region].filter(Boolean).join(', ') || null);

  // "1.2 km  •  Closes 8:00 PM" — the render's second line, verbatim.
  const distanceHours = [t('pharmacy.distanceKm', { km: pharmacy.distance_km }), hoursLine]
    .filter(Boolean)
    .join('  •  ');

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={[pharmacy.name, openLabel, distanceHours, verification]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={t('pharmacy.viewPharmacy')}
      style={[styles.phRow, divider && styles.phRowDivider]}
    >
      {/* The pharmacy's own logo when it uploaded one; otherwise the storefront mark. */}
      <CatalogImage
        uri={pharmacy.logo_url}
        size={56}
        radius={radii.md}
        fallback={
          <View style={styles.phShot}>
            <Icon name="store" size={40} color={colors.tintBlue} />
          </View>
        }
      />

      <View style={styles.phBody}>
        <View style={styles.phTitleRow}>
          <Text style={styles.phName} numberOfLines={2}>
            {pharmacy.name}
          </Text>
          <StatusBadge status={openLabel} tone={openTone} label={openLabel} size="sm" />
        </View>

        <Text style={styles.phMeta} numberOfLines={1}>
          {distanceHours}
        </Text>
        {verification ? (
          <Text style={styles.phMeta} numberOfLines={1}>
            {verification}
          </Text>
        ) : null}
        {place ? (
          <Text style={styles.phMeta} numberOfLines={1}>
            {place}
          </Text>
        ) : null}

        <MedButton
          label={t('pharmacy.viewDetails')}
          icon="store"
          variant="secondary"
          size="sm"
          onPress={onPress}
          style={styles.phAction}
        />
      </View>
    </TouchableOpacity>
  );
}

/**
 * "Verified pharmacy" / "Not verified", or nothing at all.
 *
 * The safety strip on this screen tells patients to buy from verified
 * pharmacies, so the directory has to say which ones are — and must not imply
 * an answer for a status value it does not recognise.
 */
export function verificationLine(
  status: string | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string | null {
  const value = (status ?? '').trim().toLowerCase();
  if (VERIFIED_STATUSES.has(value)) {
    return t('pharmacy.verified', { defaultValue: 'Verified pharmacy' });
  }
  if (UNVERIFIED_STATUSES.has(value)) {
    return t('pharmacy.notVerified', { defaultValue: 'Not verified' });
  }
  return null;
}

/**
 * One open hold, in full: what is being held, where, for how much, until when,
 * whether a prescription is attached, and anything the pharmacy wrote back.
 */
export function HoldCard({
  reservation,
  cancelling,
  onCancel,
  onCall,
  onOpenMedicine,
}: {
  reservation: MedicineReservation;
  cancelling: boolean;
  onCancel: () => void;
  onCall: (phone: string) => void;
  onOpenMedicine: (() => void) | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const expiresAt = reservation.expires_at ? new Date(reservation.expires_at) : null;
  const expired =
    reservation.status === 'expired' ||
    (!!expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now());

  const statusLabel = t(`pharmacy.reservationStatus.${reservation.status}`, {
    // The API's own label is the fallback, so an enum case this app has not
    // translated yet still reads as words rather than a database token.
    defaultValue: reservation.status_label,
  });
  const tone: StatusTone = expired ? 'critical' : (RESERVATION_TONES[reservation.status] ?? 'pending');

  const unit = money(reservation.unit_price, reservation.currency);
  const totalLabel = money(reservation.total_price, reservation.currency);
  const phone = callablePhone(reservation.pharmacy?.phone);

  return (
    <Card>
      <View style={styles.holdHead}>
        <CatalogImage
          uri={reservation.medicine?.image_url}
          size={40}
          radius={20}
          fallback={<TintCircle icon="receipt" tint={expired ? 'red' : 'amber'} />}
        />
        <View style={styles.holdBody}>
          <Text style={styles.holdTitle} numberOfLines={2}>
            {reservation.medicine?.name ?? t('pharmacy.selectedMedicine')}
          </Text>
          {reservation.medicine?.generic_name &&
          reservation.medicine.generic_name.toLowerCase() !==
            (reservation.medicine.name ?? '').toLowerCase() ? (
            <Text style={styles.holdMeta} numberOfLines={1}>
              {t('pharmacy.generic', { name: reservation.medicine.generic_name })}
            </Text>
          ) : null}
          <Text style={styles.holdMeta} numberOfLines={2}>
            {[
              reservation.pharmacy?.name,
              reservation.pharmacy?.city,
              t('pharmacy.reservationQuantity', { count: reservation.quantity }),
              reservation.pack_size,
            ]
              .filter(Boolean)
              .join('  •  ')}
          </Text>
        </View>
        <StatusBadge status={reservation.status} tone={tone} label={statusLabel} size="sm" />
      </View>

      <View style={styles.holdFacts}>
        <HoldFact label={t('pharmacy.reservationRef', { reference: reservation.reference })} strong />
        {unit ? <HoldFact label={`${t('pharmacy.unitPrice')}: ${unit}`} /> : null}
        {totalLabel ? <HoldFact label={`${t('pharmacy.totalPrice')}: ${totalLabel}`} strong /> : null}
        {reservation.created_at ? (
          <HoldFact
            label={t('pharmacy.reservationPlaced', {
              when: formatDateTime(reservation.created_at),
              defaultValue: 'Placed {{when}}',
            })}
          />
        ) : null}
        <HoldFact
          label={
            expired
              ? t('pharmacy.reservationExpired')
              : expiresAt
                ? t('pharmacy.reservationExpires', { when: formatDateTime(expiresAt) })
                : statusLabel
          }
          tone={expired ? 'critical' : undefined}
        />
        {reservation.prescription_id ? (
          <HoldFact
            label={t('pharmacy.reservationPrescriptionAttached', {
              defaultValue: 'Prescription attached',
            })}
          />
        ) : null}
      </View>

      {/* Anything written on the hold belongs to the patient — never hidden. */}
      {reservation.pharmacy_note ? (
        <NoticeStrip
          icon="chat"
          tone="info"
          text={`${t('pharmacy.reservationPharmacyNote', { defaultValue: 'Note from the pharmacy' })}: ${reservation.pharmacy_note}`}
        />
      ) : null}
      {reservation.patient_note ? (
        <Text style={styles.holdNote}>
          {t('pharmacy.reservationYourNote', { defaultValue: 'Your note' })}:{' '}
          {reservation.patient_note}
        </Text>
      ) : null}

      <View style={styles.holdActions}>
        {onOpenMedicine ? (
          <MedButton
            label={t('pharmacy.viewDetails')}
            icon="pill"
            variant="secondary"
            size="sm"
            onPress={onOpenMedicine}
            style={styles.holdAction}
          />
        ) : null}
        {phone ? (
          <MedButton
            label={t('pharmacy.callPharmacy')}
            icon="phone"
            variant="secondary"
            size="sm"
            onPress={() => onCall(phone)}
            style={styles.holdAction}
          />
        ) : null}
        {reservation.is_cancellable ? (
          <MedButton
            label={t('pharmacy.reservationCancel')}
            icon="close"
            variant="ghost"
            size="sm"
            disabled={cancelling}
            onPress={onCancel}
            style={styles.holdAction}
          />
        ) : null}
      </View>
    </Card>
  );
}

export function HoldFact({
  label,
  strong,
  tone,
}: {
  label: string;
  strong?: boolean;
  tone?: 'critical';
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Text
      style={[
        styles.holdFact,
        strong && styles.holdFactStrong,
        tone === 'critical' && { color: colors.statusCritical },
      ]}
      numberOfLines={2}
    >
      {label}
    </Text>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────────── */

