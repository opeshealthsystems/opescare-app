/**
 * Push notifications — the whole client half, in one place.
 *
 * Read `capability.ts` first: it explains what was broken (a permission the
 * app could not act on, and a device fingerprint sent to the server as if it
 * were a push credential) and what decides whether this build can receive a
 * push at all.
 *
 * The rule every consumer must follow: **never register a `push_token` that
 * did not come out of `acquireExpoPushToken`**, and never render copy that
 * promises delivery without first checking `getPushCapability()`.
 */
export {
  getPushCapability,
  isPushDeliverable,
  resolveProjectId,
  resolvePushPlatform,
  type PushCapability,
  type PushPlatform,
  type PushUnavailableReason,
} from './capability';

export {
  DEVICE_FINGERPRINT_KEY,
  EXPO_PUSH_TOKEN_KIND,
  PUSH_TOKEN_ID_KEY,
  PUSH_TOKEN_KIND_KEY,
  clearPushRegistration,
  deviceStore,
  getOrCreateFingerprint,
  readPushRegistrationId,
  savePushRegistration,
} from './device';

export {
  acquireExpoPushToken,
  configurePushForegroundPresentation,
  ensureAndroidChannels,
  isExpoPushToken,
  readNotificationPermission,
  type PushPermissionState,
  type PushTokenOutcome,
} from './token';

export { registerPushStrings } from './strings';

export {
  CHANNEL_SOUND_FILES,
  PUSH_CHANNEL_IDS,
  ensureNotificationChannels,
  isPushChannelId,
  type PushChannelId,
} from './channels';

export { playSoundOnWeb, soundFileFor, webSoundUri } from './sounds';

export { presentLocalNotification, type LocalNotificationInput } from './local';

export {
  PUSH_DATA_TYPES,
  isPushDataType,
  parsePushData,
  pushId,
  type PushData,
  type PushDataType,
} from './types';

export {
  CONSENT_QUERY_KEY,
  handleReceivedPush,
  openPushDestination,
  routeForPush,
  startPushListeners,
} from './handler';

export {
  markConsentAnnounced,
  onConsentRequestSignal,
  signalConsentRequest,
  wasConsentAnnounced,
} from './consentSignal';

export { PushListeners } from './PushListeners';
