/**
 * One-shot hand-off between a confirmed sign-out and the "You are signed out"
 * landing. The root layout always routes a signed-out session to the welcome
 * screen; welcome consumes this flag and forwards to /(auth)/signed-out. A cold
 * start (or a session that expired on its own) never sets it, so those keep
 * landing on welcome as before.
 */
let pending = false;

export function markSignedOutLanding(): void {
  pending = true;
}

export function consumeSignedOutLanding(): boolean {
  const was = pending;
  pending = false;
  return was;
}
