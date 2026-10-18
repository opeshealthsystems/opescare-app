import { StyleSheet } from 'react-native';

import {
  radii,
  spacing,
  typography,
  type Palette,
} from '@/components/opes-ui';

import { type Medicine } from '@/lib/api/queries';

/** Split verbatim out of app/pharmacy/[medicineId].tsx. */

export const makeStyles = (c: Palette) =>
  StyleSheet.create({
    /* MED-03 availability & pricing */
    pricingRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.xs },
    pricingCell: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
    },
    pricingCellDivided: { borderLeftWidth: 1, borderLeftColor: c.divider },
    pricingLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      textAlign: 'center',
      color: c.textMuted,
    },
    pricingValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      textAlign: 'center',
    },
    pricingSub: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      textAlign: 'center',
      color: c.textMuted,
    },
    pricingLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
    pricingLink: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      color: c.link,
    },
    pricingNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      marginTop: spacing.sm,
    },

    /* MED-03 stock meter — status, never a quantity. */
    meter: { flexDirection: 'row', gap: 3, alignSelf: 'stretch', marginTop: 4 },
    meterSegment: { flex: 1, height: 4, borderRadius: radii.pill },

    /* MED-03 "About this medicine" table + Important panel */
    aboutTable: {
      flexDirection: 'row',
      marginTop: spacing.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: c.surfaceMuted,
    },
    tableCell: { flex: 1, minWidth: 0, gap: 2, paddingHorizontal: 6 },
    tableCellDivided: { borderLeftWidth: 1, borderLeftColor: c.border },
    tableLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      color: c.textMuted,
    },
    tableValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textPrimary,
    },
    important: {
      marginTop: spacing.md,
      padding: spacing.sm + 4,
      borderRadius: radii.md,
      backgroundColor: c.statusWarningBg,
      gap: 4,
    },
    importantHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    importantTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.statusWarning,
    },
    importantBody: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },

    /* MED-03 "Choose Pack Size" four-up. ~74pt per cell at 375pt; more than
       four options wrap onto a second line rather than shrinking further. */
    packGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: spacing.sm },
    packTile: {
      flexGrow: 1,
      flexBasis: '22%',
      minWidth: 70,
      alignItems: 'center',
      gap: 2,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: 6,
      borderRadius: radii.md,
      borderWidth: 1.4,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    packSizeText: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textPrimary,
    },
    packPriceText: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      color: c.textMuted,
    },

    /* MED-03 why prices vary — a 2×2 at 375pt, not a four-up. */
    whyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2, marginTop: spacing.xs },
    whyCell: { flexGrow: 1, flexBasis: '44%', minWidth: 128, gap: 4 },
    whyMark: {
      width: 32,
      height: 32,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.statusNormalBg,
    },
    whyLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textPrimary,
    },
    whyText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 15,
      color: c.textSecondary,
    },

    /* MED-04 how to get your medicine — horizontal strip with chevrons. */
    howRail: { marginHorizontal: -spacing.md, marginTop: spacing.xs },
    howStrip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    howStep: { width: 118, gap: 5 },
    howMark: {
      width: 36,
      height: 36,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.statusNormalBg,
    },
    howTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textPrimary,
    },
    howText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 15,
      color: c.textSecondary,
    },

    screen: { flex: 1, backgroundColor: c.page },
    // The sticky footer floats over the scroll view, so the content has to
    // clear it or the last card is unreadable behind the Reserve button.
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl + 64 },
    stack: { gap: spacing.md },

    /* MED-02 green information strip */
    freshStrip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: radii.sm,
      backgroundColor: c.statusNormalBg,
    },
    freshStripText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },

    /* MED-02 "Your Location [Change] | Search Radius" two-up */
    searchRow: { flexDirection: 'row', gap: spacing.sm + 2 },
    searchCell: {
      flex: 1,
      minWidth: 0,
      gap: 4,
      padding: spacing.sm + 4,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    searchCellHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    searchCellLabel: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: c.textMuted,
    },
    searchCellFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
    },
    searchCellValue: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textPrimary,
    },
    searchCellButton: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    searchCellButtonText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      color: c.link,
    },

    /* Section head with the render's static "Sort by: Distance" pill */
    listHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.sm + 2,
    },
    listHeadTitle: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    sortPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    sortPillText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 11,
      color: c.textMuted,
    },

    /* Green accent button (solid + outline), used across all three renders. */
    accentButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      minHeight: 40,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radii.md,
      borderWidth: 1.4,
    },
    accentButtonOff: { opacity: 0.42 },
    accentButtonText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
    },

    /* MED-03 sticky footer */
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm + 4,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.surface,
    },
    footerTotal: { minWidth: 96, flexShrink: 1 },
    footerLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: c.textMuted,
    },
    footerValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: c.statusNormal,
    },
    footerButton: { flex: 1, minHeight: 46 },

    loading: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    body: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
    },
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
    },
    sectionHint: {
      marginTop: -spacing.xs,
      marginBottom: spacing.sm + 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
    },
    footNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      textAlign: 'center',
    },
    staleWrap: { marginBottom: spacing.sm + 2 },

    // Medicine card (MED-02 / MED-03 / MED-04 recipe)
    identityCardAvailable: { borderColor: c.statusNormal },
    identity: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    identityShot: {
      width: 78,
      height: 78,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    identityBody: { flex: 1, minWidth: 0, gap: 2 },
    drugName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: c.textPrimary,
    },
    drugForm: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
    },
    /* Indication tag pills — the render's "Pain relief / Fever / Headache". */
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
    tag: {
      maxWidth: 140,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    tagText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 11,
      color: c.textSecondary,
    },
    rxLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 7 },
    rxLineText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
    },
    /* The render's right-hand column, carried as a tier at 375pt. */
    identityFoot: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      rowGap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.sm + 4,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    identityFootCell: { flexGrow: 1, flexBasis: '30%', minWidth: 94, gap: 2, paddingRight: 8 },
    identityFootCellDivided: {
      borderLeftWidth: 1,
      borderLeftColor: c.divider,
      paddingLeft: 10,
    },
    identityFootHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    identityFootLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      color: c.textMuted,
    },
    identityFootValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textPrimary,
    },
    identityFootPrice: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.statusNormal,
    },
    identityFootnote: {
      marginTop: spacing.sm + 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
    },

    // Rows placed inside a padded card sit flush with its edges.
    flushRow: { paddingHorizontal: 0 },
    selectedRow: { backgroundColor: c.statusNormalBg },

    /* MED-02 stocking-pharmacy row + its stacked action column */
    stockRow: { paddingVertical: 14, paddingHorizontal: spacing.md, gap: spacing.sm + 2 },
    stockRowDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
    stockHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    stockShot: {
      width: 54,
      height: 54,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stockBody: { flex: 1, minWidth: 0, gap: 3 },
    stockTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    stockName: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textPrimary,
    },
    stockMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    stockStatusRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    stockPrice: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      color: c.statusNormal,
    },
    stockActions: { gap: 7 },

    /* MED-03/MED-04 selected-pharmacy action row */
    pharmacyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: spacing.sm + 4 },
    pharmacyAction: { flexGrow: 1, flexBasis: '30%', minWidth: 96 },

    pharmacyName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
      marginBottom: 2,
    },
    stockFacts: {
      marginTop: spacing.sm + 2,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },

    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    stepperButton: {
      width: 34,
      height: 34,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
    },
    stepperButtonOff: { opacity: 0.4 },
    stepperValue: {
      minWidth: 28,
      textAlign: 'center',
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },

    fieldLabel: {
      marginTop: spacing.md,
      marginBottom: 6,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textPrimary,
    },
    noteInput: {
      minHeight: 76,
      textAlignVertical: 'top',
      padding: spacing.sm + 2,
      borderRadius: radii.md,
      borderWidth: 1.4,
      borderColor: c.border,
      backgroundColor: c.surface,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textPrimary,
      marginBottom: 6,
    },

    summaryLine: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingVertical: 6,
    },
    summaryLabel: {
      flexShrink: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
    },
    summaryValue: {
      flex: 1,
      textAlign: 'right',
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    totalRow: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm + 2,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    total: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xxl,
      lineHeight: typography.lineHeight.xxl,
      color: c.link,
    },
    infoStrip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginTop: spacing.sm + 2,
      padding: spacing.sm + 2,
      borderRadius: radii.sm,
      backgroundColor: c.primarySoft,
    },
    infoText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },

    strip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginTop: spacing.sm + 2,
      padding: spacing.sm + 2,
      borderRadius: radii.sm,
    },
    stripText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },

    /* MED-02's amber prescription panel. There is exactly one on the screen. */
    rxCard: { backgroundColor: c.statusWarningBg, borderColor: c.statusWarning },
    rxHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
    rxMark: {
      width: 44,
      height: 44,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    rxBody: { flex: 1, minWidth: 0, gap: 4 },
    rxTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    rxButton: { marginTop: spacing.md },
    rxList: { marginTop: spacing.sm },

    outcome: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 2,
      padding: spacing.md - 2,
      borderRadius: radii.md,
    },
    outcomeBody: { flex: 1, minWidth: 0, gap: 2 },
    outcomeTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
    outcomeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    outcomeAction: { flexGrow: 1 },

    disabledReason: {
      marginTop: spacing.sm,
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
    },

    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 2,
      padding: spacing.md - 2,
      borderRadius: radii.md,
      backgroundColor: c.primarySoft,
    },
    noticeMark: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    noticeLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
    noticeLink: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.link,
    },
    noticeBody: { flex: 1, minWidth: 0, gap: 4 },
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
