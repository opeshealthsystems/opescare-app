/**
 * The notification sounds, as the JS side can reach them.
 *
 * On native the OS plays a push's sound from `res/raw/` (Android, via the
 * channel) or the app bundle (iOS, via the payload's `sound`), and a LOCAL
 * notification posted through `lib/push/local.ts` plays it the same way. So
 * native needs no audio player of its own — which is why `expo-audio` is not
 * a dependency here: it would add a native module, a microphone permission to
 * argue with, and a second copy of a sound the OS already owns.
 *
 * The web build has no notification channel and no push, so the consent
 * prompt plays the chime itself with an HTML5 `Audio` element. The files are
 * pulled through Metro with `require()`, the same way the Health ID artwork
 * is: for a non-image asset on web, Expo's asset transformer emits
 * `module.exports = "<url>"` (`@expo/metro-config` asset-transformer,
 * `buildStringRef`), honouring `experiments.baseUrl`, so the URL is the
 * module itself and `expo-asset` is not needed to resolve it. On native the
 * same `require()` yields a registry id, which nothing here plays.
 */
import { Platform } from 'react-native';
import { CHANNEL_SOUND_FILES, type PushChannelId } from './channels';

type SoundChannel = Exclude<PushChannelId, 'default'>;

const SOUND_MODULES: Record<SoundChannel, unknown> = {
  consent: require('../../assets/sounds/opescare_consent.wav'),
  messages: require('../../assets/sounds/opescare_message.wav'),
  results: require('../../assets/sounds/opescare_result.wav'),
  appointments: require('../../assets/sounds/opescare_appointment.wav'),
  emergency: require('../../assets/sounds/opescare_alert.wav'),
};

/** The basename the server and the channels agree on, or null for the default sound. */
export function soundFileFor(channel: PushChannelId): string | null {
  return CHANNEL_SOUND_FILES[channel];
}

/** The URL of a sound on the web build; null on native or for the default channel. */
export function webSoundUri(channel: PushChannelId): string | null {
  if (Platform.OS !== 'web' || channel === 'default') return null;
  const mod = SOUND_MODULES[channel];
  if (typeof mod === 'string') return mod;
  if (mod && typeof mod === 'object') {
    const uri = (mod as { uri?: unknown }).uri;
    if (typeof uri === 'string') return uri;
  }
  return null;
}

const players = new Map<string, HTMLAudioElement>();

/**
 * Play a channel's sound in the browser. Resolves `true` when playback
 * started. A tab the person has not yet interacted with refuses autoplay —
 * that is a browser rule, not an error, and the prompt is still on screen.
 */
export async function playSoundOnWeb(channel: PushChannelId): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  const uri = webSoundUri(channel);
  if (!uri) return false;
  try {
    const AudioCtor = (globalThis as { Audio?: new (src?: string) => HTMLAudioElement }).Audio;
    if (!AudioCtor) return false;
    let element = players.get(uri);
    if (!element) {
      element = new AudioCtor(uri);
      element.preload = 'auto';
      players.set(uri, element);
    }
    element.currentTime = 0;
    await element.play();
    return true;
  } catch {
    return false;
  }
}
