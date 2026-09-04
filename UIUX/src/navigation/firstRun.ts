/**
 * Has this phone ever been past the front door?
 *
 * CORE-003 was built, registered in the app stack and then never navigated to
 * by anything, so no patient has ever seen it. Wiring it needs one decision:
 * WHEN. It is the front door — a welcome carousel that ends in "Get Started" /
 * "I already have an account" — so the only honest moment for it is the very
 * first launch, before sign-in, and never again.
 *
 * That is what this flag is for. It is deliberately NOT tied to the account:
 *
 *   * A returning patient with a live session never reaches the unauthenticated
 *     tree at all, so onboarding cannot appear for them.
 *   * Once the flag is set — the moment the patient leaves the carousel in any
 *     direction — it stays set, so signing out and back in does not replay it.
 *   * It is stored per device, next to the session token, so a shared phone
 *     shows it once rather than once per patient. That is the right trade: the
 *     screen explains the app, not the account.
 *
 * A read that fails (a browser with site data blocked, a keystore that refuses)
 * is treated as "already seen". Failing that way round means the worst case is
 * a patient who misses an explainer, not one who is trapped behind it.
 */
import { getItem, setItem } from '../api/storage';

/** Same naming as the session keys in `api/client.ts`. */
const ONBOARDING_SEEN_KEY = 'opes_emr_onboarding_seen';

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await getItem(ONBOARDING_SEEN_KEY)) === '1';
  } catch {
    return true;
  }
}

/**
 * Remember that the carousel has been shown. Safe to call more than once, and
 * safe to fire without awaiting — a failure here costs a repeated explainer,
 * never a broken navigation.
 */
export async function markOnboardingSeen(): Promise<void> {
  try {
    await setItem(ONBOARDING_SEEN_KEY, '1');
  } catch {
    // Nothing to tell the patient: they are already on their way.
  }
}
