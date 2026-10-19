/**
 * Rich in-chat cards — the Finder port of design reference `src/screens/chat/cards.tsx` (archived prototype, see docs/DESIGN_REFERENCE.md).
 *
 * The OPES source draws a discriminated union of clinical cards from the
 * portal API. This app's messaging endpoint serialises five fields per
 * message and nothing else (see `lib/api/messagingQueries.ts`), so what a
 * card *can* be here is decided by `describeMessage()`:
 *
 *   • `attachment` — one or more files (the `message_attachments` schema)
 *   • `structured` — a titled key/value panel with an optional in-app CTA
 *   • `unsupported` — a type this build cannot draw, shown as an honest
 *     "find it in your records" card rather than a blank bubble
 *
 * None of these fire against the current backend; they are the shaped
 * landing place for clinician-shared content, re-skinned with the kit.
 * Nothing here fabricates data: an absent field renders as an absent card.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, radii, spacing, StatusBadge, typography, useTheme, type Palette } from '@/components/opes-ui';
import {
  describeMessage,
  fileKindLabel,
  formatFileSize,
  resolveResourceRoute,
  type MessageAttachment,
  type RichThreadMessage,
  type StructuredMessagePayload,
} from '@/lib/api/messagingQueries';
import { CardHeading, ChatButton, DetailRow } from './shared';

/** What a card may ask the screen to do. The screen owns navigation. */
export type CardHandlers = {
  /** Open an in-app route resolved client-side from a resource *kind*. */
  onOpenRoute?: (route: string) => void;
};

/** True when `describeMessage()` will hand this message to `MessageCard`. */
export function isCardMessage(message: RichThreadMessage): boolean {
  return describeMessage(message).variant !== 'text';
}

/**
 * The one entry point the thread uses: picks the renderer for a non-text
 * message. Returns `null` for a plain text message — draw a `Bubble` instead.
 */
export function MessageCard({ message, handlers }: { message: RichThreadMessage; handlers: CardHandlers }) {
  const rendered = describeMessage(message);
  switch (rendered.variant) {
    case 'attachment':
      return <AttachmentCardView attachments={rendered.attachments} caption={rendered.caption} />;
    case 'structured':
      return <StructuredCardView payload={rendered.payload} caption={rendered.caption} handlers={handlers} />;
    case 'unsupported':
      return <UnsupportedCardView />;
    default:
      return null;
  }
}

// ── Attachment ────────────────────────────────────────────────────────────

export function AttachmentCardView({ attachments, caption }: { attachments: MessageAttachment[]; caption: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <>
      <CardHeading icon="paperclip" tint="blue" title={t('messages.attachmentTitle')} />
      {!!caption && <Text style={styles.para}>{caption}</Text>}
      <View style={styles.files}>
        {attachments.map((attachment, index) => {
          const size = formatFileSize(attachment.file_size);
          const clean = (attachment.scan_status ?? 'clean').toLowerCase() === 'clean';
          return (
            <View key={attachment.id ?? `${attachment.file_name}-${index}`} style={styles.file}>
              <View style={styles.fileIcon}>
                <Icon name="document-text" size={26} color={colors.tintBlue} />
              </View>
              <View style={styles.fileBody}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {attachment.file_name}
                </Text>
                <Text style={styles.fileMeta}>{[fileKindLabel(attachment), size].filter(Boolean).join(' · ')}</Text>
              </View>
              {!clean && (
                <StatusBadge status="pending" tone="warning" size="sm" label={t('messages.attachmentScanning')} />
              )}
            </View>
          );
        })}
      </View>
      {/* No mobile route serves an attachment's bytes yet, so this card is
          deliberately informational — a download that cannot resolve would be
          a dead end. */}
      <Text style={styles.note}>{t('messages.attachmentUnavailable')}</Text>
    </>
  );
}

// ── Structured panel ──────────────────────────────────────────────────────

export function StructuredCardView({
  payload,
  caption,
  handlers,
}: {
  payload: StructuredMessagePayload;
  caption: string;
  handlers: CardHandlers;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rows = payload.rows ?? [];
  // The route is resolved client-side from a resource *kind*; a server-supplied
  // path is never pushed. Unknown kinds simply render without a CTA.
  const route = resolveResourceRoute(payload.resource);
  return (
    <>
      <CardHeading
        icon="clipboard"
        tint="blue"
        title={payload.title || t('messages.structuredTitle')}
        subtitle={payload.subtitle}
      />
      {!!caption && <Text style={styles.para}>{caption}</Text>}
      {rows.length > 0 && (
        <View style={styles.tableStack}>
          {rows.map((row, index) => (
            <View key={`${row.label}-${index}`} style={styles.table}>
              <DetailRow label={row.label} value={row.value} />
            </View>
          ))}
        </View>
      )}
      {!!route && !!handlers.onOpenRoute && (
        <ChatButton
          label={t('messages.cardOpen')}
          variant="secondary"
          size="sm"
          iconRight="chevron-right"
          onPress={() => handlers.onOpenRoute?.(route)}
        />
      )}
    </>
  );
}

// ── Unsupported ───────────────────────────────────────────────────────────

export function UnsupportedCardView() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <>
      <CardHeading icon="document" tint="blue" title={t('messages.unsupportedTitle')} />
      <Text style={styles.para}>{t('messages.unsupportedBody')}</Text>
    </>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    para: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    note: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    files: { gap: spacing.sm },
    file: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm + 2,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.sm + 2,
    },
    fileIcon: {
      width: 36,
      height: 36,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fileBody: { flex: 1, minWidth: 0 },
    fileName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    fileMeta: {
      marginTop: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    tableStack: { gap: spacing.sm },
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm + 2,
      paddingHorizontal: spacing.sm + 4,
    },
  });
