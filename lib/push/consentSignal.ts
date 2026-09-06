/**
 * How the two ways a consent request reaches this phone stay out of each
 * other's way.
 *
 * A request can arrive as a push (`data.type === 'consent_request'`, handled
 * in `lib/push/handler.ts`) and it WILL be found by the prompt's 20-second
 * poll (`components/consent/ConsentPromptWatcher.tsx`). Both want to alert the
 * patient; the patient wants to be alerted once.
 *
 * So there is one process-wide record of which request ids have already been
 * announced — by the OS showing the push, or by the app posting its own local
 * notification — and one signal the push side raises so the watcher refreshes
 * immediately instead of waiting out its interval. Neither side imports the
 * other; both import this.
 *
 * Session-scoped by design: a restart forgets, and the watcher's own freshness
 * rule (only a request created in the last couple of minutes is announced
 * natively) covers the request that was already in the tray before the app
 * was opened.
 */

type ConsentSignalListener = (requestId: string | null) => void;

const listeners = new Set<ConsentSignalListener>();
const announced = new Set<string>();

/** Record that the patient has already been alerted about this request. */
export function markConsentAnnounced(requestId: string): void {
  announced.add(requestId);
}

export function wasConsentAnnounced(requestId: string): boolean {
  return announced.has(requestId);
}

/** Raised by the push handler: "a consent request just arrived — look now". */
export function signalConsentRequest(requestId: string | null): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener(requestId);
    } catch {
      // One listener failing must not stop the others hearing it.
    }
  }
}

/** Subscribe; returns the unsubscribe. */
export function onConsentRequestSignal(listener: ConsentSignalListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
