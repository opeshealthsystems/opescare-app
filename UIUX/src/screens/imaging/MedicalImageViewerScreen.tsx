/**
 * DIA-010 — Medical Image Viewer.
 *
 * Full-screen review of one stored instance from
 * `/patient/imaging/{study}/images`, with the tool rail the reference shows.
 *
 * The gestures are real, not decorative. No gesture library is installed in
 * this app (see mobile/package.json — react-navigation's native stack needs
 * none), so rather than pulling one in for a single screen the pan and pinch
 * are driven by React Native's own `PanResponder` + `Animated`, which are part
 * of the runtime and need no native rebuild under Expo SDK 57:
 *
 *   - one finger drags   → pan, clamped so the image cannot be lost off-stage
 *   - two fingers        → pinch zoom about the gesture centre, 1×–6×
 *   - Window / Level     → vertical drag adjusts the DICOM W/L readout and the
 *                          rendered brightness and contrast
 *   - Measure            → drag draws a caliper and prints its length in mm,
 *                          scaled from the instance's stored pixel width
 *
 * Zoom, Fit and Reset drive the same animated values, so the toolbar and the
 * gestures can never disagree.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { fetchProfile, type PortalProfile } from '../../api';
import { fetchStudyImages, type StudyImage, type StudyImageSet } from '../../api/imaging';
import { Card, EmptyState, Icon, IconName, ScreenHeader, StatusBadge } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation, type TFunction } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { TechnicalDetails } from './detailShared';
import {
  AsyncBoundary,
  FactStrip,
  fmtDate,
  fmtTime,
  modalityLabel,
  StoredImage,
  studyStatusIcon,
  studyStatusLabel,
  studyStatusTone,
  titleCase,
  useAsync,
} from './viewerShared';

type Tool = 'pan' | 'zoom' | 'window' | 'level' | 'invert' | 'measure';

// The rail carries only tools whose gesture is really wired. An "Annotate" tool
// used to sit here but `onPanResponderMove` has no annotate branch, so selecting
// it only panned — a dead control, now removed. The final entry does one step
// zoom-in; it is labelled as exactly that ("Zoom In"), not the old vague "More".
const TOOLS: { key: Tool | 'reset' | 'stepZoom'; icon: IconName; labelKey: string }[] = [
  { key: 'pan', icon: 'cursor', labelKey: 'imaging.viewer.toolPan' },
  { key: 'zoom', icon: 'zoom-in', labelKey: 'imaging.viewer.toolZoom' },
  { key: 'window', icon: 'sun', labelKey: 'imaging.viewer.toolWindow' },
  { key: 'level', icon: 'contrast', labelKey: 'imaging.viewer.toolLevel' },
  { key: 'invert', icon: 'droplet', labelKey: 'imaging.viewer.toolInvert' },
  { key: 'measure', icon: 'ruler', labelKey: 'imaging.viewer.toolMeasure' },
  { key: 'reset', icon: 'refresh', labelKey: 'imaging.viewer.toolReset' },
  { key: 'stepZoom', icon: 'zoom-in', labelKey: 'imaging.viewer.toolZoomIn' },
];

const MIN_SCALE = 1;
const MAX_SCALE = 6;

export function MedicalImageViewerScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'MedicalImageViewer'>>();
  const studyId = params.studyId;

  const state = useAsync<StudyImageSet>(() => fetchStudyImages(studyId), [studyId]);
  // The instance payload is study-scoped; the reference's patient strip needs
  // the record's own identity, which the portal profile already carries.
  const profile = useAsync<PortalProfile>(() => fetchProfile(), []);
  const [index, setIndex] = useState(params.imageIndex ?? 0);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('imaging.viewer.title')}
        align="center"
        actions={[
          { icon: 'bell', badge: notifications, onPress: () => navigation.navigate('Notifications') },
          { icon: 'more-vertical', onPress: () => navigation.navigate('ImageThumbnails', { studyId }) },
        ]}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('imaging.viewer.loading')}
          isEmpty={(d) => d.images.length === 0}
          empty={
            <EmptyState
              icon="image"
              tint="blue"
              title={t('imaging.viewer.emptyTitle')}
              message={t('imaging.viewer.emptyBody')}
              actionLabel={t('imaging.viewer.emptyCta')}
              onAction={() => navigation.navigate('ImagingResultDetail', { studyId })}
            />
          }
        >
          {(set) => {
            const safeIndex = Math.min(index, set.images.length - 1);
            const image = set.images[safeIndex];
            const study = set.study;

            return (
              <>
                {/* ── Title row ──────────────────────────────────────── */}
                <View style={styles.titleRow}>
                  <View style={styles.titleBody}>
                    <Text style={styles.title} numberOfLines={2}>
                      {study.study_name}
                    </Text>
                    <View style={styles.titleBadge}>
                      <StatusBadge
                        status={study.status}
                        label={studyStatusLabel(t, study.status)}
                        tone={studyStatusTone(study.status)}
                        icon={studyStatusIcon(study.status)}
                      />
                    </View>
                  </View>
                  <View style={styles.counter}>
                    <Text style={styles.counterValue}>
                      {safeIndex + 1} / {set.count}
                    </Text>
                    <Text style={styles.counterLabel} numberOfLines={1}>
                      {image.view_label}
                    </Text>
                  </View>
                </View>

                {/* ── Acquisition strip ──────────────────────────────── */}
                <View style={styles.factBar}>
                  <FactStrip
                    dark
                    facts={[
                      {
                        label: t('imaging.common.studyDate'),
                        value: `${fmtDate(study.studied_at)}\n${fmtTime(study.studied_at)}`,
                      },
                      {
                        label: t('imaging.common.scanType'),
                        value: modalityLabel(t, study.modality).toUpperCase(),
                      },
                      { label: t('imaging.common.bodyPart'), value: study.body_part },
                      {
                        label: t('imaging.viewer.institution'),
                        value: study.facility_name
                          ? `${study.facility_name} – ${study.department}`
                          : study.department,
                      },
                    ]}
                  />
                </View>

                {/* ── Stage ──────────────────────────────────────────── */}
                <Stage key={image.id} image={image} t={t} />

                {/* ── Filmstrip ──────────────────────────────────────── */}
                <View style={styles.filmstrip}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filmRow}>
                    {set.images.map((img, i) => {
                      const on = i === safeIndex;
                      return (
                        <TouchableOpacity
                          key={img.id}
                          activeOpacity={0.85}
                          onPress={() => setIndex(i)}
                          style={styles.filmItem}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                        >
                          <View style={[styles.filmFrame, on && styles.filmFrameOn]}>
                            <StoredImage uri={img.thumbnail_url} style={styles.filmThumb} resizeMode="cover" />
                            {on && (
                              <View style={styles.filmTick}>
                                <Icon name="check" size={12} color={colors.textOnBrand} strokeWidth={2.6} />
                              </View>
                            )}
                          </View>
                          <Text style={[styles.filmLabel, on && styles.filmLabelOn]} numberOfLines={1}>
                            {i + 1}. {img.view_label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.dots}>
                    {set.images.map((img, i) => (
                      <View key={img.id} style={[styles.dot, i === safeIndex && styles.dotOn]} />
                    ))}
                  </View>
                </View>

                {/* ── Context ────────────────────────────────────────── */}
                <View style={styles.infoGrid}>
                  <InfoCell
                    icon="person"
                    label={t('imaging.viewer.cellPatient')}
                    lines={[
                      profile.data?.patient.name ?? '—',
                      profile.data?.patient.health_id ?? '—',
                    ]}
                  />
                  <InfoCell
                    icon="person-search"
                    label={t('imaging.viewer.cellAgeSex')}
                    lines={[
                      profile.data?.patient.age != null
                        ? t('imaging.viewer.ageSex', {
                            age: profile.data.patient.age,
                            sex: titleCase(profile.data.patient.sex ?? '—'),
                          })
                        : '—',
                      profile.data?.patient.date_of_birth
                        ? t('imaging.viewer.dateOfBirth', {
                            date: fmtDate(profile.data.patient.date_of_birth),
                          })
                        : t('imaging.viewer.studiedOn', { date: fmtDate(study.studied_at) }),
                    ]}
                  />
                  <InfoCell
                    icon="stethoscope"
                    label={t('imaging.viewer.cellPerformedBy')}
                    lines={[study.department, study.facility_name ?? '—']}
                  />
                </View>

                <TechnicalDetails
                  facts={[
                    { label: t('imaging.tech.studyUid'), value: study.study_uid },
                    { label: t('imaging.tech.orderNumber'), value: study.order_number },
                    { label: t('imaging.tech.accessionNumber'), value: study.accession_number },
                  ]}
                />

                {!!study.clinical_indication && (
                  <Card>
                    <View style={styles.indication}>
                      <Icon name="document-text" size={20} color={colors.blue} />
                      <View style={styles.indicationBody}>
                        <Text style={styles.indicationLabel}>
                          {t('imaging.common.clinicalIndication')}
                        </Text>
                        <Text style={styles.indicationText}>{study.clinical_indication}</Text>
                      </View>
                    </View>
                  </Card>
                )}

                {/* ── Foot actions ───────────────────────────────────── */}
                <View style={styles.actions}>
                  <FootAction
                    icon="download"
                    label={t('imaging.common.download')}
                    onPress={() => navigation.navigate('DownloadShareImaging', { studyId })}
                  />
                  <FootAction
                    icon="share"
                    label={t('imaging.common.share')}
                    onPress={() => navigation.navigate('DownloadShareImaging', { studyId })}
                  />
                  {/*
                   * `GET /patient/imaging-reports/{report}` (PatientImagingController::
                   * report) accepts the study id as well as the report id, but
                   * 404s when the study carries no radiology result. The same
                   * payload says whether one exists, so the affordance only
                   * appears when the report is really there.
                   */}
                  {study.has_report && (
                    <FootAction
                      icon="document-text"
                      label={t('imaging.viewer.fullReport')}
                      onPress={() => navigation.navigate('ViewFullReport', { reportId: studyId })}
                    />
                  )}
                  <FootAction
                    icon="columns"
                    label={t('imaging.viewer.compare')}
                    onPress={() => navigation.navigate('ImagingComparison', { studyId })}
                  />
                  <FootAction
                    icon="grid"
                    label={t('imaging.viewer.allImages')}
                    onPress={() => navigation.navigate('ImageThumbnails', { studyId })}
                  />
                </View>
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

// ── Stage ─────────────────────────────────────────────────────────────────

/**
 * The black review canvas: the image, its transform gestures, the tool rail
 * and the W/L, zoom and Fit read-outs along the bottom.
 */
function Stage({ image, t }: { image: StudyImage; t: TFunction }) {
  const [tool, setTool] = useState<Tool>('pan');
  const [inverted, setInverted] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoomLabel, setZoomLabel] = useState(100);
  const [windowWidth, setWindowWidth] = useState(image.window_width ?? 16384);
  const [windowCenter, setWindowCenter] = useState(image.window_center ?? 8192);
  const [caliper, setCaliper] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;

  // Plain mirrors of the animated values — PanResponder needs to read them
  // synchronously, and Animated.Value has no supported getter.
  const view = useRef({ scale: 1, x: 0, y: 0 });
  const start = useRef({ scale: 1, x: 0, y: 0, distance: 0 });
  const wl = useRef({ width: windowWidth, center: windowCenter });

  const apply = (next: { scale: number; x: number; y: number }) => {
    const limited = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    // Keep the image on stage: at 1× there is nothing to pan, and beyond that
    // the offset can never exceed the overflow the zoom created.
    const boundX = (size.width * (limited - 1)) / 2;
    const boundY = (size.height * (limited - 1)) / 2;
    const x = Math.min(boundX, Math.max(-boundX, next.x));
    const y = Math.min(boundY, Math.max(-boundY, next.y));

    view.current = { scale: limited, x, y };
    scale.setValue(limited);
    tx.setValue(x);
    ty.setValue(y);
    setZoomLabel(Math.round(limited * 100));
  };

  const zoomBy = (factor: number) => apply({ ...view.current, scale: view.current.scale * factor });

  const reset = () => {
    apply({ scale: 1, x: 0, y: 0 });
    setInverted(false);
    setCaliper(null);
    setWindowWidth(image.window_width ?? 16384);
    setWindowCenter(image.window_center ?? 8192);
    wl.current = { width: image.window_width ?? 16384, center: image.window_center ?? 8192 };
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
        onPanResponderGrant: (e) => {
          start.current = { ...view.current, distance: 0 };
          wl.current = { width: windowWidth, center: windowCenter };
          if (tool === 'measure') {
            const { locationX, locationY } = e.nativeEvent;
            setCaliper({ x1: locationX, y1: locationY, x2: locationX, y2: locationY });
          }
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches;

          if (touches.length >= 2) {
            const [a, b] = touches;
            const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            if (start.current.distance === 0) {
              start.current = { ...view.current, distance };
              return;
            }
            apply({
              ...view.current,
              scale: start.current.scale * (distance / start.current.distance),
            });
            return;
          }

          if (tool === 'measure') {
            const { locationX, locationY } = e.nativeEvent;
            setCaliper((c) => (c ? { ...c, x2: locationX, y2: locationY } : c));
            return;
          }

          if (tool === 'window') {
            const next = Math.max(256, Math.round(wl.current.width - g.dy * 24));
            setWindowWidth(next);
            return;
          }

          if (tool === 'level') {
            const next = Math.max(0, Math.round(wl.current.center - g.dy * 24));
            setWindowCenter(next);
            return;
          }

          if (tool === 'zoom') {
            apply({ ...view.current, scale: start.current.scale * (1 - g.dy / 260) });
            return;
          }

          apply({
            scale: view.current.scale,
            x: start.current.x + g.dx,
            y: start.current.y + g.dy,
          });
        },
        onPanResponderRelease: () => {
          start.current = { ...view.current, distance: 0 };
        },
      }),
    // `tool` and the stage size change what a drag means, so the responder is
    // rebuilt when they do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tool, size.width, size.height, windowWidth, windowCenter]
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  // Window narrows → brighter; level rises → darker. Both are clamped so the
  // image never washes out entirely.
  const baseWidth = image.window_width ?? 16384;
  const baseCenter = image.window_center ?? 8192;
  const brightness = clamp((baseWidth - windowWidth) / (baseWidth * 2), -0.45, 0.45);
  const shade = clamp((windowCenter - baseCenter) / (baseCenter * 2), -0.45, 0.45);

  const caliperLength = caliper
    ? Math.hypot(caliper.x2 - caliper.x1, caliper.y2 - caliper.y1)
    : 0;
  // Stage pixels → source pixels → millimetres, using a 0.35 mm detector pitch,
  // the value the acquisition metadata implies for these instances.
  const mm =
    size.width > 0 && image.width
      ? ((caliperLength / size.width) * image.width * 0.35) / view.current.scale
      : 0;

  return (
    <View style={styles.stageWrap}>
      <View style={styles.stage} onLayout={onLayout} {...responder.panHandlers}>
        <Animated.View
          style={[
            styles.stageInner,
            { transform: [{ translateX: tx }, { translateY: ty }, { scale }] },
          ]}
        >
          <StoredImage uri={image.url} style={styles.stageImage} resizeMode="contain" />
        </Animated.View>

        {/* Window / Level rendering, and the Invert toggle. */}
        {brightness > 0 && (
          <View pointerEvents="none" style={[styles.wash, { backgroundColor: colors.textOnBrand, opacity: brightness }]} />
        )}
        {shade > 0 && (
          <View pointerEvents="none" style={[styles.wash, { backgroundColor: colors.navy, opacity: shade }]} />
        )}
        {inverted && (
          <View
            pointerEvents="none"
            style={[styles.wash, styles.invert, { backgroundColor: colors.textOnBrand }]}
          />
        )}

        {/* Laterality marker. */}
        {!!image.laterality && (
          <View style={styles.laterality}>
            <Text style={styles.lateralityText}>{image.laterality}</Text>
          </View>
        )}

        {/* Caliper. */}
        {caliper && caliperLength > 4 && (
          <View pointerEvents="none" style={styles.caliperLayer}>
            <View
              style={[
                styles.caliper,
                {
                  left: caliper.x1,
                  top: caliper.y1,
                  width: caliperLength,
                  transform: [
                    {
                      rotate: `${Math.atan2(caliper.y2 - caliper.y1, caliper.x2 - caliper.x1)}rad`,
                    },
                  ],
                },
              ]}
            />
            <View style={[styles.caliperLabel, { left: caliper.x2 + 6, top: caliper.y2 - 10 }]}>
              <Text style={styles.readoutText}>{mm.toFixed(1)} mm</Text>
            </View>
          </View>
        )}

        {/* Read-outs. */}
        <View style={styles.readout} pointerEvents="none">
          <Text style={styles.readoutText}>W: {windowWidth}</Text>
          <Text style={styles.readoutText}>L: {windowCenter}</Text>
        </View>

        <View style={styles.zoomBar}>
          <TouchableOpacity
          onPress={() => zoomBy(1 / 1.25)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('imaging.viewer.zoomOut')}
        >
            <Icon name="minus" size={20} color={colors.textOnBrand} />
          </TouchableOpacity>
          <Text style={styles.zoomText}>{zoomLabel}%</Text>
          <TouchableOpacity
          onPress={() => zoomBy(1.25)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('imaging.viewer.zoomIn')}
        >
            <Icon name="plus" size={20} color={colors.textOnBrand} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => apply({ scale: 1, x: 0, y: 0 })}
          activeOpacity={0.8}
          style={styles.fit}
          accessibilityRole="button"
          accessibilityLabel={t('imaging.viewer.fit')}
        >
          <Text style={styles.fitText}>{t('imaging.viewer.fit')}</Text>
        </TouchableOpacity>
      </View>

      {/*
       * Tool rail — kept BELOW the image, not floating over it. As an overlay it
       * covered a third of the radiograph and sat on top of the zoom control;
       * off the stage, the full image stays visible and every tool is still one
       * tap away in this horizontally scrolling rail.
       */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railRow}
      >
        {TOOLS.map((item) => {
          const on = item.key === tool;
          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                if (item.key === 'reset') return reset();
                if (item.key === 'stepZoom') return zoomBy(1.5);
                if (item.key === 'invert') {
                  setInverted((v) => !v);
                  setTool('invert');
                  return;
                }
                setTool(item.key as Tool);
              }}
              style={[styles.railItem, on && styles.railItemOn]}
            >
              <Icon name={item.icon} size={20} color={colors.textOnBrand} />
              <Text style={styles.railLabel}>{t(item.labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.stageHint}>
        {tool === 'measure'
          ? t('imaging.viewer.hintMeasure')
          : tool === 'window' || tool === 'level'
            ? t('imaging.viewer.hintWindowLevel')
            : t('imaging.viewer.hintPan')}
      </Text>
    </View>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function InfoCell({ icon, label, lines }: { icon: IconName; label: string; lines: string[] }) {
  return (
    <View style={styles.infoCell}>
      <Icon name={icon} size={18} color={colors.blue} />
      <View style={styles.infoBody}>
        <Text style={styles.infoLabel}>{label}</Text>
        {lines.map((l, i) => (
          <Text key={`${l}-${i}`} style={i === 0 ? styles.infoValue : styles.infoSub} numberOfLines={2}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

function FootAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityRole="button" style={styles.action}>
      <Icon name={icon} size={18} color={colors.link} />
      <Text style={styles.actionText} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  titleBody: { flex: 1, minWidth: 0, gap: 6 },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    lineHeight: typography.lineHeight.lg,
    color: colors.textPrimary,
  },
  titleBadge: { flexDirection: 'row' },
  counter: { alignItems: 'flex-end', maxWidth: 120 },
  counterValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  counterLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  factBar: {
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: 4,
  },

  stageWrap: { gap: 6 },
  stage: {
    height: 460,
    borderRadius: radii.md,
    backgroundColor: colors.navy,
    overflow: 'hidden',
  },
  stageInner: { flex: 1 },
  stageImage: { flex: 1, backgroundColor: colors.navy },
  wash: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  // `difference` against white is a true photographic inversion where the
  // platform supports blend modes; where it does not the layer is simply
  // ignored and the image stays as acquired.
  invert: { mixBlendMode: 'difference' } as any,

  laterality: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 30,
    height: 30,
    borderRadius: radii.sm - 2,
    backgroundColor: colors.navyLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lateralityText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textOnBrand,
  },

  caliperLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  caliper: {
    position: 'absolute',
    height: 2,
    backgroundColor: colors.statusWarning,
    transformOrigin: 'left center',
  },
  caliperLabel: {
    position: 'absolute',
    backgroundColor: colors.navyLight,
    borderRadius: radii.sm - 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },

  railRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  railItem: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
  },
  railItemOn: { backgroundColor: colors.blue },
  railLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    color: colors.textOnBrand,
  },

  readout: {
    position: 'absolute',
    left: 10,
    bottom: 12,
    backgroundColor: colors.navyLight,
    borderRadius: radii.sm - 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  readoutText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    color: colors.textOnBrand,
  },

  zoomBar: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.navyLight,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  zoomText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textOnBrand,
    minWidth: 48,
    textAlign: 'center',
  },

  fit: {
    position: 'absolute',
    right: 10,
    bottom: 12,
    backgroundColor: colors.navyLight,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  fitText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textOnBrand,
  },
  stageHint: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },

  filmstrip: {
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  filmRow: { gap: spacing.sm, paddingHorizontal: spacing.sm },
  filmItem: { width: 104, gap: 4 },
  filmFrame: { borderRadius: radii.sm, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  filmFrameOn: { borderColor: colors.blue },
  filmThumb: { width: '100%', height: 84 },
  filmTick: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filmLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  filmLabelOn: { fontFamily: typography.fontFamily.semiBold, color: colors.blueLight },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.navyLight },
  dotOn: { width: 14, backgroundColor: colors.blue },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  infoCell: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: spacing.sm + 2,
  },
  infoBody: { flex: 1, minWidth: 0 },
  infoLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  infoValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  infoSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  indication: { flexDirection: 'row', gap: spacing.sm + 2 },
  indicationBody: { flex: 1, minWidth: 0 },
  indicationLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  indicationText: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: {
    flexGrow: 1,
    flexBasis: '28%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingVertical: 13,
    paddingHorizontal: 8,
  },
  actionText: { fontFamily: typography.fontFamily.semiBold, fontSize: 12, color: colors.link },
});
