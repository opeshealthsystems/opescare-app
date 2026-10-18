/**
 * A Code 128-B barcode, drawn to actually scan.
 *
 * The approved passport design puts a barcode in the page footer beside the
 * document number, and a great deal of health infrastructure still reads
 * barcodes rather than QR — a hospital's own label printers and scanners
 * usually speak Code 128 and nothing else.
 *
 * THIS IS A REAL ENCODING, not a picture of stripes. The symbol below encodes
 * the value it is given, with the proper start code, modulo-103 check symbol
 * and stop pattern, so a scanner reads back exactly the Health ID printed
 * under it. Drawing decorative stripes that no scanner can read would be a lie
 * told in a place where someone might rely on it — a clerk who scans and gets
 * nothing has been failed by the document.
 *
 * Only the printable ASCII range (32–126) is encodable in code set B; anything
 * outside it means the caller was handed something a barcode cannot carry, so
 * the component renders nothing rather than a symbol that decodes to the wrong
 * string.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { passportColors as c } from './tokens';

/**
 * The 107 Code 128 symbols, as bar/space module widths. Index 0–102 are the
 * data symbols (value == index in code set B), 103–105 the start codes, 106
 * the stop pattern. Each string is six digits: bar, space, bar, space, bar,
 * space — the stop pattern carries a seventh module.
 */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/** Module widths for the whole symbol, or null when the value cannot be encoded. */
export function code128bModules(value: string): number[] | null {
  if (!value) return null;

  const codes: number[] = [];
  for (const char of value) {
    const point = char.charCodeAt(0);
    if (point < 32 || point > 126) return null; // not encodable in code set B
    codes.push(point - 32);
  }

  let checksum = START_B;
  codes.forEach((code, i) => {
    checksum += code * (i + 1);
  });
  checksum %= 103;

  const symbols = [START_B, ...codes, checksum, STOP];
  const modules: number[] = [];
  for (const symbol of symbols) {
    for (const width of PATTERNS[symbol]) modules.push(Number(width));
  }

  return modules;
}

export function Barcode({
  value,
  width = 150,
  height = 34,
  showValue = true,
}: {
  value: string;
  width?: number;
  height?: number;
  showValue?: boolean;
}) {
  const modules = useMemo(() => code128bModules(value), [value]);

  if (!modules) return null;

  const total = modules.reduce((sum, m) => sum + m, 0);
  const unit = width / total;

  // Modules alternate bar, space, bar, space… starting with a bar.
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  modules.forEach((moduleWidth, i) => {
    const w = moduleWidth * unit;
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });

  return (
    <View style={styles.wrap} accessible accessibilityRole="image" accessibilityLabel={value}>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} fill="#FFFFFF" />
        {bars.map((bar, i) => (
          <Rect key={i} x={bar.x} y={0} width={bar.w} height={height} fill="#0F172A" />
        ))}
      </Svg>
      {showValue ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
  value: { marginTop: 3, fontSize: 8, fontWeight: '700', letterSpacing: 1.1, color: c.text },
});
