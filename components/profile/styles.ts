import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { radii, spacing, typography, useTheme, type Palette } from '@/components/opes-ui';

/**
 * The My Profile design language, as one stylesheet. Lifted verbatim from
 * app/(tabs)/profile.tsx so every profile-type screen (patient, clinician,
 * public provider, dependent) draws from the same numbers — change a value
 * here and every profile moves together.
 */
export const makeProfileStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.page },
    paperWave: {
      pointerEvents: 'none',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 300,
      // The asset is already drawn at watermark strength, so this is close to
      // full — the restraint is in the artwork, not in a low alpha that would
      // just grey it.
      opacity: 0.75,
    },
    content: {
      padding: spacing.md,
      gap: spacing.md,
      paddingBottom: spacing.xxl,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      gap: spacing.md,
    },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
    },

    /* Brand bar */
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    topBarSide: { width: 30, alignItems: 'flex-start' },
    topBarBrand: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    topBarActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    topBarBell: { position: 'relative', padding: 2 },
    topBarBadge: {
      position: 'absolute',
      top: -3,
      right: -5,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.badge,
    },
    topBarBadgeText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 10,
      lineHeight: 14,
      color: c.textOnBrand,
    },
    topAvatarWrap: { position: 'relative' },
    topAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.primarySoft,
    },
    topAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
    topAvatarText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 13,
      color: c.blue,
    },
    topAvatarDot: {
      position: 'absolute',
      right: -1,
      bottom: -1,
      width: 11,
      height: 11,
      borderRadius: 6,
      backgroundColor: c.statusNormal,
      borderWidth: 2,
      borderColor: c.page,
    },

    /* Heading + motto */
    headingRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    headingText: { flex: 1, minWidth: 0, gap: 3 },
    headingTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.4,
      color: c.textPrimary,
    },
    headingSub: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
    },
    motto: {
      borderLeftWidth: 2,
      borderLeftColor: c.blue,
      paddingLeft: spacing.sm,
      maxWidth: 122,
    },
    mottoText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 10,
      lineHeight: 15,
      letterSpacing: 0.9,
      color: c.blue,
    },

    /* 1. Identity card */
    identity: { gap: spacing.md },
    identityMain: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      flexWrap: 'wrap',
    },
    // width/height come from the measured card — see `columns`.
    portrait: {
      borderRadius: radii.md,
      overflow: 'hidden',
      backgroundColor: c.primarySoft,
    },
    // objectFit, not resizeMode: on RN 0.86 / rn-web 0.21 the style
    // property is `objectFit`, and the prop alone left this at
    // object-fit: fill, stretching a square photo into a 3:4 frame.
    portraitImg: { width: '100%', height: '100%' },
    portraitFallback: { alignItems: 'center', justifyContent: 'center' },
    portraitInitials: { fontFamily: typography.fontFamily.bold, color: c.blue },
    portraitCamera: {
      position: 'absolute',
      right: -7,
      bottom: -7,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.blue,
      borderWidth: 2,
      borderColor: c.surface,
    },
    identityBody: { flex: 1, minWidth: 0, gap: 5 },
    identityNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    identityName: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.bold,
      fontSize: 16,
      lineHeight: 21,
      color: c.textPrimary,
    },
    identityQuote: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontStyle: 'italic',
      fontSize: 11,
      lineHeight: 15,
      color: c.link,
    },
    // The render's vertical divider between "who you are" and "your ID".
    identityRule: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: c.border,
    },
    verifiedPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radii.pill,
    },
    verifiedText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 12,
      lineHeight: 16,
    },
    identityLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    identityLineText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 17,
      color: c.textSecondary,
    },

    /* Health ID panel */
    idPanel: { alignItems: 'center', gap: 4, paddingLeft: 6 },
    // The narrow-screen shape: a full-width band under the details, divided by
    // a rule instead of standing beside one.
    idPanelStacked: {
      width: '100%',
      paddingLeft: 0,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    idPanelHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    idPanelTitle: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.bold,
      fontSize: 9,
      lineHeight: 12,
      letterSpacing: 0.4,
      color: c.textPrimary,
    },
    idPanelQr: {
      width: 72,
      height: 72,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    idPanelGlyph: {
      width: 72,
      height: 72,
      alignItems: 'center',
      justifyContent: 'center',
    },
    idPanelCode: {
      alignSelf: 'stretch',
      textAlign: 'center',
      fontFamily: typography.fontFamily.bold,
      fontSize: 9.5,
      lineHeight: 12,
      letterSpacing: 0.1,
      color: c.textPrimary,
    },
    idPanelAction: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    idPanelActionText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 10,
      color: c.link,
    },

    /* 2. Trust strip */
    trust: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'stretch',
      paddingVertical: spacing.sm,
    },
    trustCellHalf: {
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: '50%',
      paddingVertical: spacing.sm,
    },
    trustCell: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 2,
    },
    trustRule: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: 2,
    },
    trustText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 10,
      lineHeight: 13,
      textAlign: 'center',
      color: c.textSecondary,
    },

    /* 3. Quick overview */
    block: { gap: spacing.sm },
    blockHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    blockHeadLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      flexShrink: 1,
      minWidth: 0,
    },
    blockTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    blockAction: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    blockActionText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.link,
    },
    overviewRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm - 2,
    },
    // Width comes from the measured row — see `overviewGrid`.
    overviewCard: {
      gap: 3,
      padding: spacing.sm,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    overviewTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    overviewMark: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    overviewValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 21,
      lineHeight: 26,
      color: c.textPrimary,
      marginTop: 2,
    },
    overviewLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 10,
      lineHeight: 14,
      color: c.textPrimary,
    },
    overviewHint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      lineHeight: 13,
      color: c.textMuted,
    },

    /* Completeness ring */
    ringWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 4,
    },
    ringTrack: { position: 'absolute', borderColor: c.divider },
    ringFill: { position: 'absolute', transform: [{ rotate: '45deg' }] },
    ringText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 14,
      color: c.textPrimary,
    },

    /* 4-6. Panels */
    panel: { gap: spacing.md, overflow: 'hidden' },
    panelSeal: {
      pointerEvents: 'none',
      position: 'absolute',
      right: -22,
      bottom: -26,
      width: 132,
      height: 132,
      opacity: 0.07,
    },
    panelHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    panelMark: {
      width: 38,
      height: 38,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    panelHeadText: { flex: 1, minWidth: 0, gap: 1 },
    panelTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    panelSub: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 15,
      color: c.textSecondary,
    },
    panelAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.primarySoft,
    },
    panelActionText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.link,
    },

    /* Fact grid */
    factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 4 },
    factCell: { flexBasis: '45%', flexGrow: 1, padding: spacing.sm },
    factCellWide: { flexBasis: '100%' },
    factInner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 7,
      paddingLeft: 2,
    },
    factMark: {
      width: 30,
      height: 30,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    factBody: { flex: 1, minWidth: 0, gap: 1 },
    factLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      lineHeight: 14,
      color: c.textPrimary,
    },
    factValue: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: 17,
      color: c.textSecondary,
    },
    factSub: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 15,
      color: c.textMuted,
    },

    /* Link tiles */
    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    // Width comes from the measured grid — see `tileGrid`. The tiles do not
    // grow, so a short last row stays left-aligned instead of stretching one
    // orphan across the panel.
    linkTile: {
      minHeight: 82,
      borderRadius: radii.md,
      paddingHorizontal: 6,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    linkTileTop: { position: 'relative' },
    linkTileBadge: {
      position: 'absolute',
      top: -6,
      right: -10,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.badge,
    },
    linkTileBadgeText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 10,
      lineHeight: 14,
      color: c.textOnBrand,
    },
    linkTileLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      lineHeight: 14,
      textAlign: 'center',
      color: c.textPrimary,
    },

    /* 7. Privacy footer */
    privacy: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: c.statusNormalBg,
    },
    privacyMark: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    privacyBody: { flex: 1, minWidth: 120, gap: 2 },
    privacyTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      color: c.statusNormal,
    },
    privacyText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 15,
      color: c.textSecondary,
    },
    privacyRule: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: c.border,
    },
    privacyMotto: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 9,
      lineHeight: 13,
      letterSpacing: 0.7,
      color: c.blue,
    },

    /* Sign out */
    signOut: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.statusCritical,
      backgroundColor: c.surface,
    },
    signOutText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.statusCritical,
    },
  });

export type ProfileStyles = ReturnType<typeof makeProfileStyles>;

/** Themed profile styles, memoised on the palette. */
export function useProfileStyles(): ProfileStyles {
  const { colors } = useTheme();
  return useMemo(() => makeProfileStyles(colors), [colors]);
}
