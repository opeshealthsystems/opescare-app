/**
 * Foreground notification sound.
 *
 * When a notification arrives while the app is OPEN, the OS notification sound
 * is not guaranteed (a foreground push on web shows a notification but may not
 * chime; a foreground Expo notification's sound is up to the handler), so the
 * app plays the mapped alert itself. The mapping — (category, severity) → one of
 * six synthesized WAVs — lives in `soundManifest.ts` and is shared with the
 * service worker's payload contract.
 *
 * WEB is the fully-wired path: `new Audio(soundUrl(...)).play()`, which resolves
 * to the WAVs served from `public/sounds/`. Autoplay policy can reject the
 * play() before the user has interacted with the page; that rejection is
 * swallowed — a missed chime is never worth throwing on.
 *
 * NATIVE mapped playback needs an audio module (expo-audio / expo-av). Neither
 * is a dependency of this app today, and adding one is a native-rebuild step, so
 * native foreground sound is left to expo-notifications' own handler
 * (`shouldPlaySound`, channel-based) — see `registration.ts`. This function is a
 * no-op on native rather than pulling in a module that isn't installed; the
 * mapping and the call site are in place for when that module is added.
 *
 * The one hard rule: this never throws. Audio is a courtesy layered on top of a
 * notification that has already been shown and recorded.
 */
import { Platform } from 'react-native';
import { soundFor, soundUrl } from '../notifications/soundManifest';

export function playNotificationSound(category: string, severity: string): void {
  try {
    if (Platform.OS === 'web') {
      if (typeof Audio === 'undefined') return;
      const audio = new Audio(soundUrl(soundFor(category, severity)));
      // play() returns a promise that rejects under autoplay policy — swallow it.
      void audio.play().catch(() => undefined);
    }
    // Native: intentionally silent here (see the module note above).
  } catch {
    // Never throw out of a sound.
  }
}
