import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { iconStroke } from '../theme';
import { useTheme } from '../ThemeProvider';
import { decorative } from './a11y';

/**
 * The single icon set for the OPES EMR mobile app.
 *
 * Screen agents MUST use `<Icon name="..." />` and never hand-roll SVG paths,
 * so stroke weight and optical size stay consistent across every screen.
 *
 * All glyphs are drawn on a 24x24 grid, outline style, round caps/joins,
 * matching the reference renders in `mobile app screens/`.
 */

type Glyph = {
  /** Stroked path `d` attributes. */
  d?: string[];
  /** Stroked circles: [cx, cy, r]. */
  c?: [number, number, number][];
  /** Filled path `d` attributes (use sparingly — dots, badges). */
  fill?: string[];
  /** Filled circles: [cx, cy, r]. */
  fc?: [number, number, number][];
};

const GLYPHS = {
  // ---- Navigation / chrome -------------------------------------------------
  home: { d: ['M3 10.5 12 3.5l9 7V20a1 1 0 0 1-1 1h-4.5v-6h-7v6H4a1 1 0 0 1-1-1z'] },
  'heart-pulse': {
    d: [
      'M12 20.5S3.5 15.2 3.5 9.4A4.9 4.9 0 0 1 12 6a4.9 4.9 0 0 1 8.5 3.4c0 1.5-.6 2.9-1.4 4.2',
      'M3.8 12.5h3.4l1.6-3 2.4 5.6 1.9-3.8 1.2 1.2h4.3',
    ],
  },
  chat: {
    d: ['M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3.5V16H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
    fc: [[8.5, 10.5, 1], [12, 10.5, 1], [15.5, 10.5, 1]],
  },
  person: { d: ['M4.5 20.5c0-3.9 3.4-6.2 7.5-6.2s7.5 2.3 7.5 6.2'], c: [[12, 8, 4]] },
  'person-search': {
    d: ['M3.5 20.5c0-3.4 2.8-5.6 6.5-5.6', 'M18.8 18.8 21 21'],
    c: [[10, 8, 4], [16.5, 16.5, 2.8]],
  },
  users: {
    d: ['M2.5 20c0-3.2 2.6-5.1 6-5.1s6 1.9 6 5.1', 'M16.5 15.2c2.9.2 5 2.1 5 4.8'],
    c: [[8.5, 8.5, 3.6], [16.8, 8.8, 2.9]],
  },
  menu: { d: ['M4 7h16', 'M4 12h16', 'M4 17h16'] },
  'more-vertical': { fc: [[12, 5, 1.6], [12, 12, 1.6], [12, 19, 1.6]] },
  grid: {
    d: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  },
  settings: {
    d: ['M4 7h16', 'M4 17h16'],
    c: [[9, 7, 2.4], [15, 17, 2.4]],
  },

  // ---- Chevrons / arrows ---------------------------------------------------
  'chevron-right': { d: ['m9 5 7 7-7 7'] },
  'chevron-left': { d: ['m15 5-7 7 7 7'] },
  'chevron-down': { d: ['m5 9 7 7 7-7'] },
  'chevron-up': { d: ['m5 15 7-7 7 7'] },
  'arrow-right': { d: ['M4 12h15', 'm13 6 6 6-6 6'] },
  'arrow-left': { d: ['M20 12H5', 'm11 6-6 6 6 6'] },
  'arrow-up-right': { d: ['M7 17 17 7', 'M8.5 7H17v8.5'] },
  'external-link': { d: ['M14 4h6v6', 'M20 4 11 13', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'] },

  // ---- Clinical ------------------------------------------------------------
  flask: {
    d: ['M9.5 3v6.2L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3l-4.9-8.8V3', 'M8 3h8', 'M7.2 14.5h9.6'],
  },
  pill: {
    d: ['M13.2 4.4a4.5 4.5 0 0 1 6.4 6.4l-8.8 8.8a4.5 4.5 0 0 1-6.4-6.4z', 'm8.4 9.2 6.4 6.4'],
  },
  capsule: {
    d: ['M13.2 4.4a4.5 4.5 0 0 1 6.4 6.4l-8.8 8.8a4.5 4.5 0 0 1-6.4-6.4z'],
    c: [[8.5, 15.5, 2.6]],
  },
  stethoscope: {
    d: ['M6 3v5a4 4 0 0 0 8 0V3', 'M6 3H4.5', 'M14 3h1.5', 'M10 12v3a4.5 4.5 0 0 0 9 0v-2.2'],
    c: [[19, 10.5, 2.2]],
  },
  lungs: {
    d: [
      'M12 3v9',
      'M12 8c-1.6 0-2.6-1-3.6-1S6 8.4 5.3 10.5c-.7 2-1.1 4.3-1.1 6a2 2 0 0 0 2.9 1.8L12 16',
      'M12 8c1.6 0 2.6-1 3.6-1s2.4 1.4 3.1 3.5c.7 2 1.1 4.3 1.1 6a2 2 0 0 1-2.9 1.8L12 16',
    ],
  },
  activity: { d: ['M3 12.5h4l2.5-6 4 12 2.5-6H21'] },
  target: { c: [[12, 12, 8], [12, 12, 3.5]], d: ['M12 2v2.5', 'M12 19.5V22', 'M2 12h2.5', 'M19.5 12H22'] },
  /** Bar chart — the CORE-006 "Health Summary" band mark. */
  'bar-chart': { d: ['M5 20V12', 'M10 20V4', 'M15 20V9', 'M20 20v-5'] },
  droplet: { d: ['M12 3.5c3.2 3.4 5.5 6.2 5.5 9a5.5 5.5 0 0 1-11 0c0-2.8 2.3-5.6 5.5-9z'] },
  syringe: {
    d: ['m14 4 6 6', 'm17 7-9.5 9.5L4 20l3.5-3.5', 'm12 9 3 3', 'M15.5 5.5 18.5 8.5'],
  },
  microscope: {
    d: ['M9 4h3v7H9z', 'M10.5 11a5.5 5.5 0 0 1 5.5 5.5', 'M4 21h16', 'M7 21a6 6 0 0 1 3-11.2'],
  },
  'heart-rate': { d: ['M3 12h4l2-5 3 10 2.5-5H21'] },
  'shield-check': { d: ['M12 3 5 6v6c0 4.3 2.9 7.4 7 9 4.1-1.6 7-4.7 7-9V6z', 'm9 12 2.2 2.2L15.5 10'] },
  shield: { d: ['M12 3 5 6v6c0 4.3 2.9 7.4 7 9 4.1-1.6 7-4.7 7-9V6z'] },
  'first-aid': { d: ['M4 6h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M9 6V4h6v2', 'M12 10v6', 'M9 13h6'] },

  // ---- Records / documents -------------------------------------------------
  folder: { d: ['M3 6h6l2 2h10v11a1 1 0 0 1-1 1H3z'] },
  'folder-plus': { d: ['M3 6h6l2 2h10v11a1 1 0 0 1-1 1H3z', 'M12 12v5', 'M9.5 14.5h5'] },
  document: { d: ['M6 3h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M13 3v5h5', 'M8.5 13h7', 'M8.5 16.5h5'] },
  'document-text': { d: ['M6 3h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M13 3v5h5', 'M8.5 12h7', 'M8.5 15.5h7', 'M8.5 19h4'] },
  clipboard: { d: ['M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2', 'M9 3h6v4H9z', 'M8.5 12h7', 'M8.5 16h5'] },
  'id-card': {
    d: ['M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M13.5 10h5', 'M13.5 14h4', 'M5.5 16c0-1.9 1.4-3 3.2-3s3.2 1.1 3.2 3'],
    c: [[8.7, 9.5, 2]],
  },
  qr: {
    d: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h2.5v2.5H14z', 'M20 14v3', 'M17.5 19.5H20v.5', 'M14 20h1'],
  },
  image: { d: ['M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'm4 17 4.5-4.5 3 3L15 12l6 5.5'], c: [[9, 8.5, 1.6]] },
  print: { d: ['M7 9V3h10v6', 'M5 9h14a1 1 0 0 1 1 1v6h-3', 'M7 16H4a1 1 0 0 1-1-1v-5', 'M7 13h10v8H7z'] },

  // ---- Scheduling ----------------------------------------------------------
  calendar: { d: ['M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M3 10.5h18', 'M8 3.5v4', 'M16 3.5v4'] },
  'calendar-plus': { d: ['M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M3 10.5h18', 'M8 3.5v4', 'M16 3.5v4', 'M12 13v5', 'M9.5 15.5h5'] },
  'calendar-check': { d: ['M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M3 10.5h18', 'M8 3.5v4', 'M16 3.5v4', 'm9 15.5 2.2 2.2 4-4'] },
  clock: { d: ['M12 7.5V12l3 1.8'], c: [[12, 12, 8.5]] },
  refresh: { d: ['M20 12a8 8 0 1 1-2.6-5.9', 'M20.5 4v4.5H16'] },
  bell: { d: ['M18 9a6 6 0 0 0-12 0c0 5-2 6-2 6h16s-2-1-2-6', 'M10.3 20a2 2 0 0 0 3.4 0'] },
  'bell-off': { d: ['M18 9a6 6 0 0 0-9.3-5', 'M6.2 7.4A6 6 0 0 0 6 9c0 5-2 6-2 6h13', 'M10.3 20a2 2 0 0 0 3.4 0', 'm3.5 3.5 17 17'] },
  video: { d: ['M3 7h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z', 'm15 11 6-3.5v9L15 13'] },

  // ---- Places / contact ----------------------------------------------------
  location: { d: ['M12 21.5c4.5-4.6 7-8 7-11.2a7 7 0 1 0-14 0c0 3.2 2.5 6.6 7 11.2z'], c: [[12, 10, 2.6]] },
  building: { d: ['M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16', 'M15 10h4a1 1 0 0 1 1 1v10', 'M2.5 21h19', 'M7.5 8h4', 'M7.5 12h4', 'M7.5 16h4'] },
  phone: { d: ['M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6L16.5 13l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z'] },
  mail: { d: ['M3 5.5h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z', 'm2.5 7 9.5 6.5L21.5 7'] },
  globe: { d: ['M2.5 12h19', 'M12 2.5c2.6 2.6 4 6 4 9.5s-1.4 6.9-4 9.5c-2.6-2.6-4-6-4-9.5s1.4-6.9 4-9.5z'], c: [[12, 12, 9.5]] },

  // ---- Actions -------------------------------------------------------------
  plus: { d: ['M12 5v14', 'M5 12h14'] },
  minus: { d: ['M5 12h14'] },
  close: { d: ['m6 6 12 12', 'm18 6-12 12'] },
  check: { d: ['m5 12.5 4.5 4.5L19 7.5'] },
  'check-circle': { d: ['m8 12.2 2.8 2.8L16.5 9.3'], c: [[12, 12, 9]] },
  'x-circle': { d: ['m9 9 6 6', 'm15 9-6 6'], c: [[12, 12, 9]] },
  'alert-circle': { d: ['M12 7.5v5.5'], c: [[12, 12, 9]], fc: [[12, 16.5, 1.1]] },
  'alert-triangle': { d: ['M12 3.8 2.8 20h18.4z', 'M12 9.5v4.5'], fc: [[12, 17.2, 1.1]] },
  info: { d: ['M12 11.5v5'], c: [[12, 12, 9]], fc: [[12, 8, 1.1]] },
  download: { d: ['M12 3.5v11', 'm7.5 10.5 4.5 4.5 4.5-4.5', 'M4 19.5h16'] },
  upload: { d: ['M12 20.5v-11', 'm7.5 13.5 4.5-4.5 4.5 4.5', 'M4 4.5h16'] },
  share: { d: ['m8.8 13 6.4 3.6', 'm15.2 7.4-6.4 3.6'], c: [[18, 5.8, 2.8], [6, 12, 2.8], [18, 18.2, 2.8]] },
  search: { d: ['m17.5 17.5 3.5 3.5'], c: [[11, 11, 7]] },
  filter: { d: ['M3 5.5h18', 'M6.5 12h11', 'M10 18.5h4'] },
  edit: { d: ['M4 20h4L20 8a2.1 2.1 0 0 0-3-3L5 17z', 'm15.5 6.5 3 3'] },
  trash: { d: ['M4 6.5h16', 'M9 6.5V4h6v2.5', 'M6 6.5 7 20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13.5', 'M10.5 10v7', 'M13.5 10v7'] },
  copy: { d: ['M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z', 'M15 6V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h2'] },
  send: { d: ['M21 3 2.5 10.5l7.5 3L13 21z', 'm10 13.5 11-10.5'] },
  paperclip: { d: ['M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.4 3.4 0 0 1 4.8 4.8L9.5 17a1.8 1.8 0 0 1-2.6-2.6l7.7-7.7'] },
  star: { d: ['m12 3.5 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9z'] },
  cart: { d: ['M3 4h2.2l2.4 11.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 8H6'], c: [[9.5, 19.5, 1.5], [17, 19.5, 1.5]] },
  /** Storefront — pharmacy (MED-003 / MED-005). */
  store: {
    d: ['M3.5 9.5V20a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1V9.5', 'M3 9.5 4.8 4a1 1 0 0 1 .95-.7h12.5a1 1 0 0 1 .95.7L21 9.5a2.6 2.6 0 0 1-4.4 2 2.6 2.6 0 0 1-4.6 0 2.6 2.6 0 0 1-4.6 0 2.6 2.6 0 0 1-4.4-2z', 'M9.5 21v-5.5h5V21'],
  },
  /** Delivery van — fulfilment status (MED-003 / MED-005). */
  truck: {
    d: ['M2.5 6.5A1 1 0 0 1 3.5 5.5h9a1 1 0 0 1 1 1v10H2.5z', 'M13.5 9.5h3.6a1 1 0 0 1 .82.43l2.4 3.4a1 1 0 0 1 .18.57v3.1h-7z', 'M6.5 16.5h1.5', 'M13.5 16.5h1.5'],
    c: [[9.2, 18.2, 1.7], [17.6, 18.2, 1.7]],
  },
  'credit-card': { d: ['M3 5.5h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z', 'M2 10h20', 'M6 14.5h4'] },
  wallet: { d: ['M3 7a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v1', 'M3 7v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1H4'], fc: [[17.5, 14.5, 1.3]] },

  // ---- Security / prefs ----------------------------------------------------
  lock: { d: ['M7 10.5V8a5 5 0 0 1 10 0v2.5', 'M5.5 10.5h13a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1z'], fc: [[12, 15.5, 1.4]] },
  'lock-open': { d: ['M7 10.5V8a5 5 0 0 1 9.5-2.2', 'M5.5 10.5h13a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1z'], fc: [[12, 15.5, 1.4]] },
  key: { d: ['m20 4-8.5 8.5', 'm16.5 7.5 2 2', 'm13.5 10.5 2 2'], c: [[8, 16, 4.5]] },
  fingerprint: {
    d: [
      'M12 21c-1.6-2-2.5-4.4-2.5-7a2.5 2.5 0 0 1 5 0c0 1.3.3 2.6.8 3.8',
      'M6.5 18.5A11 11 0 0 1 5 12a7 7 0 0 1 14 0c0 1.4-.2 2.7-.5 4',
      'M3.5 7.5A9.5 9.5 0 0 1 12 2.5c2 0 3.9.6 5.5 1.7',
    ],
  },
  eye: { d: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'], c: [[12, 12, 3]] },
  'eye-off': { d: ['M4 8.5C2.9 9.9 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.2-1', 'M9.5 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5s-1 1.8-2.7 3.4', 'm3.5 3.5 17 17', 'M10 10a2.8 2.8 0 0 0 4 4'] },
  sun: { d: ['M12 2.5v2.5', 'M12 19v2.5', 'M4.2 4.2 6 6', 'M18 18l1.8 1.8', 'M2.5 12H5', 'M19 12h2.5', 'M4.2 19.8 6 18', 'M18 6l1.8-1.8'], c: [[12, 12, 4]] },
  moon: { d: ['M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z'] },
  ruler: { d: ['M3.5 15 15 3.5l5.5 5.5L9 20.5z', 'm7 11.5 2 2', 'm10 8.5 2 2', 'm13 5.5 2 2'] },
  camera: { d: ['M3 8h3.5L8 5.5h8L17.5 8H21a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z'], c: [[12, 13, 3.8]] },
  logout: { d: ['M15 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10', 'M18 8.5 21.5 12 18 15.5', 'M21 12h-11'] },
  /** Open book — "Health Education" on the CARE-015 waiting-room tiles. */
  book: { d: ['M12 6.5v13', 'M12 6.5C10.4 5.2 8.4 4.5 6 4.5H3v13h3c2.4 0 4.4.7 6 2', 'M12 6.5c1.6-1.3 3.6-2 6-2h3v13h-3c-2.4 0-4.4.7-6 2'] },

  bulb: { d: ['M9.5 18h5', 'M10 21h4', 'M8 13.5a5 5 0 1 1 8 0c-.8 1-1.2 1.7-1.3 2.5h-5.4c-.1-.8-.5-1.5-1.3-2.5z'] },

  // ---- Imaging viewer / DIA-007..020 --------------------------------------
  /** Pan tool — the pointer arrow on the DIA-010 tool rail. */
  cursor: { d: ['M5.5 3.2 19 10.6l-6.1 1.5-1.6 6.2z'] },
  'zoom-in': { d: ['m17.5 17.5 3.5 3.5', 'M11 8v6', 'M8 11h6'], c: [[11, 11, 7]] },
  'zoom-out': { d: ['m17.5 17.5 3.5 3.5', 'M8 11h6'], c: [[11, 11, 7]] },
  /** Window / level contrast control. */
  contrast: { c: [[12, 12, 9]], fill: ['M12 3a9 9 0 0 1 0 18z'] },
  'more-horizontal': { fc: [[5, 12, 1.6], [12, 12, 1.6], [19, 12, 1.6]] },
  /** Fit to screen. */
  maximize: { d: ['M4 9V5a1 1 0 0 1 1-1h4', 'M15 4h4a1 1 0 0 1 1 1v4', 'M20 15v4a1 1 0 0 1-1 1h-4', 'M9 20H5a1 1 0 0 1-1-1v-4'] },
  /** Side-by-side compare. */
  columns: { d: ['M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M12 4v16'] },
  list: { d: ['M9 6h11', 'M9 12h11', 'M9 18h11'], fc: [[4.5, 6, 1.3], [4.5, 12, 1.3], [4.5, 18, 1.3]] },
  history: { d: ['M3.6 12a8.4 8.4 0 1 0 2.6-6.1', 'M3 4v4.5h4.5', 'M12 8v4.3l3 1.8'] },

  // ---- Preparation instructions (DIA-017) ---------------------------------
  shirt: { d: ['M8.6 3.2 12 5.6l3.4-2.4 4.6 2.6-2 4.1-2-1V20.8H8V8.9l-2 1-2-4.1z'] },
  magnet: { d: ['M5 4v8.5a7 7 0 0 0 14 0V4h-4.5v8.5a2.5 2.5 0 0 1-5 0V4z', 'M5 8.5h4.5', 'M14.5 8.5H19'] },
  cup: { d: ['M5 8h11v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z', 'M16 10.5h2.2a2.4 2.4 0 0 1 0 4.8H16', 'M8.5 3v2.2', 'M12.5 3v2.2'] },
  baby: { d: ['M6 21c0-3.8 2.7-6.2 6-6.2s6 2.4 6 6.2'], c: [[12, 7, 4.2]], fc: [[10.4, 6.4, 0.85], [13.6, 6.4, 0.85]] },
  // ---- Messaging (MSG-001) -------------------------------------------------
  /** Delivered/read receipt on an outgoing bubble. */
  'check-double': { d: ['m2.5 12.5 4 4 8.5-9', 'm11 16.5 1 1 8.5-9'] },
  /** Emoji picker in the composer. */
  smile: {
    d: ['M8.2 14.2a4.8 4.8 0 0 0 7.6 0'],
    c: [[12, 12, 9]],
    fc: [[9, 9.8, 1.05], [15, 9.8, 1.05]],
  },

  'help-circle': {
    d: ['M9.4 9.4a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.8.7-.8 1.3v.6'],
    c: [[12, 12, 9]],
    fc: [[12, 16.8, 1.1]],
  },

  // ---- Messaging & billing (MSG-002, BILL-001/002/003) --------------------
  /** Support headset — "Contact Support" / "Need Help?" (BILL-002, BILL-003). */
  headset: {
    d: [
      'M4 14v-2a8 8 0 0 1 16 0v2',
      'M4 13h1.8a1 1 0 0 1 1 1v3.6a1 1 0 0 1-1 1H4.8A1.8 1.8 0 0 1 3 16.8v-2a1.8 1.8 0 0 1 1-1.8z',
      'M20 13h-1.8a1 1 0 0 0-1 1v3.6a1 1 0 0 0 1 1h1a1.8 1.8 0 0 0 1.8-1.8v-2a1.8 1.8 0 0 0-1-1.8z',
      'M19 18.6v.6a2.2 2.2 0 0 1-2.2 2.2H13',
    ],
  },
  /** Paid receipt document (BILL-003 card header). */
  receipt: {
    d: [
      'M5 3.5h14v17l-2.3-1.6-2.3 1.6-2.4-1.6L9.6 20.5 7.3 18.9 5 20.5z',
      'M8.6 8.5h6.8',
      'M8.6 12.4h4.6',
    ],
  },
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof GLYPHS;

/** Every available icon name — handy for building pickers or debug screens. */
export const iconNames = Object.keys(GLYPHS) as IconName[];

export type IconProps = {
  name: IconName;
  /** Rendered box in px. Default 24. */
  size?: number;
  /** Stroke + fill colour. Default `colors.textPrimary`. */
  color?: string;
  /** Override stroke width. Defaults by size (see `iconStroke`). */
  strokeWidth?: number;
  /**
   * Only for an icon that carries meaning nothing else on screen carries — a
   * lone status glyph in a table cell, say.
   *
   * WITHOUT this the icon is hidden from screen readers, which is the right
   * default: virtually every icon in this app sits beside the words it
   * illustrates, and announcing "image" before every row title is noise that
   * teaches a blind patient to swipe faster than they read.
   */
  accessibilityLabel?: string;
};

function defaultStroke(size: number): number {
  if (size <= 18) return iconStroke.thin;
  if (size >= 28) return iconStroke.bold;
  return iconStroke.regular;
}

export function Icon({
  name,
  size = 24,
  color,
  strokeWidth,
  accessibilityLabel,
}: IconProps) {
  const { colors } = useTheme();
  const resolvedColor = color ?? colors.textPrimary;
  const g = GLYPHS[name] as Glyph;
  const sw = strokeWidth ?? defaultStroke(size);
  const a11y = accessibilityLabel
    ? ({ accessible: true, accessibilityRole: 'image', accessibilityLabel } as const)
    : decorative;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...a11y}>
      {g.d?.map((d, i) => (
        <Path
          key={`d${i}`}
          d={d}
          stroke={resolvedColor}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
      {g.c?.map(([cx, cy, r], i) => (
        <Circle key={`c${i}`} cx={cx} cy={cy} r={r} stroke={resolvedColor} strokeWidth={sw} fill="none" />
      ))}
      {g.fill?.map((d, i) => (
        <Path key={`f${i}`} d={d} fill={resolvedColor} />
      ))}
      {g.fc?.map(([cx, cy, r], i) => (
        <Circle key={`fc${i}`} cx={cx} cy={cy} r={r} fill={resolvedColor} />
      ))}
    </Svg>
  );
}
