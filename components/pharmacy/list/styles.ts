import { StyleSheet } from 'react-native';

import { radii, spacing, typography, type Palette } from '@/components/opes-ui';

/** Split verbatim out of app/pharmacy.tsx. */

export const makeStyles = (c: Palette) =>
  StyleSheet.create({
    /* MED-01 category rail */
    catTile: {
      width: 84,
      minHeight: 92,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingHorizontal: 6,
      paddingVertical: spacing.sm,
      marginRight: spacing.xs,
    },
    catMark: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 11,
      lineHeight: 14,
      textAlign: 'center',
      color: c.textSecondary,
    },
    catCount: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 10,
      color: c.textMuted,
    },

    screen: { flex: 1, backgroundColor: c.page },
    content: {
      padding: spacing.md,
      gap: spacing.md,
      paddingBottom: spacing.xxl,
    },
    stack: { gap: spacing.md },

    /* MED-01 search field */
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      minHeight: 52,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1.4,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    /* MED-01 filter dropdown pills */
    dropPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: 210,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    dropPillText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    dropPillCount: {
      minWidth: 18,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: radii.pill,
      backgroundColor: c.statusNormalBg,
    },
    dropPillCountText: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.bold,
      fontSize: 10,
      color: c.statusNormal,
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

    chipRail: { marginHorizontal: -spacing.md },
    chipRailContent: {
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
      alignItems: 'center',
    },

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

    loading: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
      gap: spacing.sm,
    },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
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

    /* MED-01 medicine hero card — the name owns the full width and wraps;
       availability, price and pack size sit on their own tier underneath.
       `medBody` needs `minWidth: 0` or the flex child refuses to shrink and
       the text overflows the row instead of wrapping inside it. */
    medRow: {
      paddingVertical: 14,
      paddingHorizontal: spacing.md,
      gap: spacing.sm + 2,
    },
    medRowAvailable: { backgroundColor: c.statusNormalBg },
    medHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    medShot: {
      width: 62,
      height: 62,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    medBody: { flex: 1, minWidth: 0, gap: 2 },
    medName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: c.textPrimary,
    },
    medMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
    },
    /* The render's indication tag pills. */
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
    tag: {
      maxWidth: 130,
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
    rxLine: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    rxLineText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
    },
    /* The render's right-hand column, carried as a tier at 375pt. */
    medFoot: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      rowGap: spacing.sm,
      paddingTop: spacing.sm + 2,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    medFootCell: {
      flexGrow: 1,
      flexBasis: '30%',
      minWidth: 92,
      gap: 2,
      paddingRight: 8,
    },
    medFootCellDivided: {
      borderLeftWidth: 1,
      borderLeftColor: c.divider,
      paddingLeft: 10,
    },
    medFootHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    medFootLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      color: c.textMuted,
    },
    medFootValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textPrimary,
    },
    medFootPrice: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.statusNormal,
    },

    /* MED-01 pharmacy card */
    phRow: {
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: spacing.md,
    },
    phShot: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    phBody: { flex: 1, minWidth: 0, gap: 2 },
    phTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    phName: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textPrimary,
    },
    phMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    phAction: { alignSelf: 'flex-start', marginTop: spacing.sm },

    holdHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
    },
    holdBody: { flex: 1, minWidth: 0, gap: 2 },
    holdTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    holdMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    holdFacts: {
      gap: 2,
      marginTop: spacing.sm + 2,
      paddingTop: spacing.sm + 2,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    holdFact: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    holdFactStrong: {
      fontFamily: typography.fontFamily.semiBold,
      color: c.textPrimary,
    },
    holdNote: {
      marginTop: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    holdActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    holdAction: { flexGrow: 1 },

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
