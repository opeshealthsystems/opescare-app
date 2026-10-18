import { Platform } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';

/**
 * Blocks screenshots and screen recording (and blanks the app-switcher
 * thumbnail on Android) while a screen showing health data is mounted —
 * the Health ID, the record, the passport, documents. Native only.
 */
export const usePrivateScreen: () => void =
  Platform.OS === 'web' ? () => undefined : () => usePreventScreenCapture('opescare-private');
