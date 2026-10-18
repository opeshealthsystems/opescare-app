

import { StyleSheet } from 'react-native';





import {
  PillInput,
  radii,
  spacing,
  typography,
  type Palette,
} from '@/components/opes-ui';






/** Split verbatim out of app/blood-finder.tsx. */

export const makeStyles = (c: Palette) =>
  StyleSheet.create({
    /* PM-BLOOD-01 finder card */
    fieldRow: { flexDirection: 'row', gap: spacing.sm },
    // The reference splits step 1 / step 2 about 60:40, not 55:45 — five
    // group tiles need the room, and the component dropdown does not.
    fieldWide: { flex: 1.55, minWidth: 0 },
    fieldNarrow: { flex: 1, minWidth: 0 },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    fieldNumber: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    fieldLabelText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    groupRow: { flexDirection: 'row', gap: 6 },
    // Square-ish tiles, as drawn. flexBasis 0 rather than `flex: 1` so all
    // five share the row exactly whatever their labels are.
    groupPill: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
      height: 44,
      borderRadius: radii.sm,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupPillText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
    },
    groupMore: { gap: 1 },
    groupMoreText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 10,
      color: c.textSecondary,
    },

    selectField: {
      height: 46,
      borderRadius: radii.sm,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
    },
    selectValue: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: 14,
      color: c.textPrimary,
    },

    urgencyRow: { flexDirection: 'row', gap: 6 },
    urgencyButton: {
      flex: 1,
      minWidth: 0,
      height: 46,
      borderRadius: radii.sm,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 3,
    },
    urgencyText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
    },

    locationField: {
      height: 46,
      borderRadius: radii.sm,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 10,
    },
    locationText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    locateButton: { padding: 2 },
    changeCity: { paddingTop: 5, alignSelf: 'flex-start' },
    changeCityText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
    },

    findButtonText: {
      flex: 1,
      textAlign: 'center',
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: '#FFFFFF',
    },

    /* PM-BLOOD-01 bank card */
    bankRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
    },
    bankMark: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bankBody: { flex: 1, gap: 3 },
    bankNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    bankName: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    bankMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    bankFreshRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    bankFresh: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    componentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
    componentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
    },
    componentChipLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
    },
    componentChipUnits: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 11,
    },
    bankAside: { alignItems: 'center', gap: 2, width: 62 },
    bankUnits: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
    },
    bankUnitsLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      lineHeight: 13,
      color: c.textMuted,
      textAlign: 'center',
    },
    bankCall: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    bankCallOff: { opacity: 0.45 },

    /* PM-BLOOD-01 hero */
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    topBarBack: { width: 28, alignItems: 'flex-start' },
    topBarBrand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    topBarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    topBarAction: { padding: 4 },
    topBarBadge: {
      position: 'absolute',
      top: -2,
      right: -4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topBarBadgeText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 10,
      color: '#FFFFFF',
    },

    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    heroMark: {
      width: 52,
      height: 52,
      borderRadius: radii.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroBody: { flex: 1, minWidth: 0 },
    heroTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      lineHeight: typography.lineHeight.xl,
      color: c.textPrimary,
    },
    heroSubtitle: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      marginTop: 1,
    },
    heroBadge: {
      // Capped so the title keeps the width it needs at 375pt. The reference
      // is drawn on a wider phone; the badge is what gives way, not the name.
      maxWidth: 104,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 7,
      paddingVertical: 6,
      borderRadius: radii.md,
    },
    heroBadgeBody: { flexShrink: 1 },
    heroBadgeNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      color: c.textMuted,
    },
    heroBadgeTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xs,
    },

    /* The numbered finder card */
    finderStack: { gap: spacing.md },
    finderField: { gap: spacing.xs },
    finderFieldHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    finderIndex: {
      width: 22,
      height: 22,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    finderIndexText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xs,
    },
    finderLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    ownGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: 4,
    },
    ownGroupText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
    findButton: {
      marginTop: spacing.md,
      height: 56,
      borderRadius: radii.md,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      gap: spacing.xs,
    },

    /* Trust strip */
    trustRow: {
      flexDirection: 'row',
      paddingVertical: spacing.sm,
    },
    trustItem: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 6,
    },
    trustText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
      textAlign: 'center',
    },

    /* Four-up entry grid */
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    quickTile: {
      // Four equal columns. flexBasis 0 (not a percentage) so the four share
      // the row exactly; minWidth 0 so a long label wraps instead of pushing
      // its neighbours off the edge.
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
      minHeight: 76,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.surface,
      paddingVertical: spacing.sm,
      paddingHorizontal: 8,
      gap: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickMark: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLabel: {
      // 11pt, not 13. At a quarter of the row each tile is ~80pt wide, and
      // "Emergency" at 13pt broke mid-word into "Emergenc / y request".
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      lineHeight: 14,
      textAlign: 'center',
      color: c.textPrimary,
    },

    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.md },

    emergencyHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
    emergencyMark: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emergencyBody: { flex: 1, minWidth: 0, gap: 2 },
    emergencyTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
    emergencyText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
    actionButton: { flexGrow: 1, flexBasis: 140 },

    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chipRail: { marginHorizontal: -spacing.md },
    chipRailContent: {
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
      alignItems: 'center',
    },
    afterRail: { marginTop: spacing.sm },

    optionTitle: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.textPrimary,
    },

    sectionHint: {
      marginTop: -spacing.xs,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
    },

    // PillInput carries its own bottom margin; the scroll container already
    // spaces siblings, so cancel the double gap.
    searchWrap: { position: 'relative', marginBottom: -spacing.md },
    searchClear: {
      position: 'absolute',
      right: spacing.md,
      top: 0,
      bottom: spacing.md,
      justifyContent: 'center',
    },

    rowAside: { alignItems: 'flex-end', gap: 4 },
    rowValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    facts: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },

    noteStrip: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      gap: 2,
    },
    noteLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    noteText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
    },
    facilityNote: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },

    cardFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
    },
    footCall: { flexGrow: 1, flexBasis: 120 },
    footCta: { flexGrow: 1, flexBasis: 160 },
    footAction: { flexGrow: 1, flexBasis: 120 },

    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 2,
      padding: spacing.md - 2,
      borderRadius: radii.md,
      backgroundColor: c.primarySoft,
    },
    noticeBody: { flex: 1, minWidth: 0, gap: 2 },
    noticeTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    noticeText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
  });
