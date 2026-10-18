import { StyleSheet } from 'react-native';

import {
  radii,
  spacing,
  typography,
  type Palette,
} from '@/components/opes-ui';

/** Split verbatim out of app/appointments/book.tsx. */

export const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    fill: { flex: 1 },
    gutter: { paddingHorizontal: spacing.md },
    content: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },
    listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
    progress: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
    block: { marginBottom: spacing.md },
    listCard: { marginBottom: spacing.sm + 4 },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
    loading: { alignItems: 'center', gap: spacing.sm },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textMuted,
    },
    footerSpinner: { alignItems: 'center', paddingVertical: spacing.md },

    chipStrip: { flexGrow: 0, marginBottom: spacing.md },
    chipStripContent: { gap: spacing.sm, paddingRight: spacing.sm },

    linkAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    linkText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.link,
    },

    cardHeadWrap: { marginBottom: spacing.md - 4 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    cardTitle: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    cardHint: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    cardFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, flexShrink: 1 },
    footHint: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    cardLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    cardLineText: {
      flex: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

    emptyActions: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },

    sectionIntro: { marginTop: spacing.xs },
    sectionHint: {
      marginTop: -4,
      marginBottom: spacing.sm + 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    overline: { marginTop: spacing.xs },

    rowBetween: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm },
    rowHeader: { marginBottom: 0, flexShrink: 1 },
    monthLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
      textTransform: 'capitalize',
    },
    slotsHeader: { marginBottom: 0 },

    dayStrip: { gap: spacing.sm, paddingRight: 2, paddingBottom: 2 },
    dayChip: {
      width: 66,
      borderRadius: radii.md,
      borderWidth: 1,
      paddingVertical: 9,
      alignItems: 'center',
      gap: 2,
    },
    dayChipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    dayChipOff: { backgroundColor: colors.surface, borderColor: colors.border },
    dayWeek: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 11,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    dayDate: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    dayTextOn: { color: colors.textOnBrand },
    dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent', marginTop: 2 },
    dayDotOn: { backgroundColor: colors.statusNormal },
    dayDotOnActive: { backgroundColor: colors.textOnBrand },

    buckets: { gap: spacing.md },
    bucketHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm + 2 },
    bucketLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    bucketRule: { flex: 1, height: 1, backgroundColor: colors.border },
    bucketCount: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    slotChip: { minWidth: 92, justifyContent: 'center' },

    stickyFooter: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: spacing.sm + 4,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    footerCard: { padding: spacing.sm + 4 },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4 },
    footerIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerBody: { flex: 1, minWidth: 0 },
    footerTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    footerText: {
      marginTop: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },

    almost: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      padding: spacing.md - 2,
      borderRadius: radii.md,
      backgroundColor: colors.statusNormalBg,
    },
    almostIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.statusNormal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    almostBody: { flex: 1, minWidth: 0 },
    almostTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.statusNormal,
    },
    almostText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    textarea: {
      minHeight: 92,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.sm + 4,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    counter: {
      alignSelf: 'flex-end',
      marginTop: 4,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },

    rows: { paddingHorizontal: spacing.md },
    summary: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    errorWrap: { gap: spacing.sm },

    hero: { alignItems: 'center', gap: spacing.sm + 2, paddingVertical: spacing.md },
    heroMark: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.statusNormal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    heroText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
      textAlign: 'center',
    },

    detailsHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    detailsTitle: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },

    providerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md - 2,
      padding: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    providerBody: { flex: 1, minWidth: 0, gap: 1 },
    providerLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    providerName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textPrimary,
    },
    providerSpecialty: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    meta: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

    ctaStack: { gap: spacing.sm + 4 },
  });
