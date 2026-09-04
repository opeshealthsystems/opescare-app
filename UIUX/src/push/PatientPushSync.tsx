/**
 * Keeps the patient's push wiring in step with the live session.
 *
 * When a PATIENT session becomes active — a fresh sign-in, or a returning PWA
 * whose token was restored on launch — this:
 *
 *   1. (re)subscribes this browser to Web Push, so a new deploy or a cleared
 *      subscription is re-registered without waiting for the next sign-in;
 *   2. loads the patient's muted-category map, so the foreground chime knows
 *      what to stay silent for.
 *
 * Both are fire-and-forget and both no-op cleanly off the web / without a
 * service worker, so this renders nothing and never blocks.
 *
 * It lives here rather than inside AuthContext deliberately: AuthContext's
 * restore path is exercised by the screen-render harness for every screen, and
 * a network call made there would fire on every mounted screen. This component
 * is only ever mounted by the real App shell.
 */
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { refreshMutePreferences } from './preferences';
import { subscribeWebPush } from './webPush';

export function PatientPushSync(): null {
  const { sessionKind } = useAuth();

  useEffect(() => {
    if (sessionKind !== 'patient') return;
    void subscribeWebPush();
    void refreshMutePreferences();
  }, [sessionKind]);

  return null;
}
