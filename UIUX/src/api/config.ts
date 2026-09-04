import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Points at the EMRIS Laravel API. Override by setting `apiBaseUrl` under
 * `expo.extra` in app.json (or EXPO_PUBLIC_API_BASE_URL), e.g. your machine's
 * LAN IP for a physical device, or a deployed staging URL.
 *
 * Defaults assume `php artisan serve` on the host machine:
 *  - Android emulator reaches the host via 10.0.2.2, not localhost.
 *  - iOS simulator and web can use localhost directly.
 */
function defaultBaseUrl(): string {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000/api/v1';
  }
  return 'http://localhost:8000/api/v1';
}

const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
const fromExtra = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;

export const API_BASE_URL = fromEnv || fromExtra || defaultBaseUrl();
