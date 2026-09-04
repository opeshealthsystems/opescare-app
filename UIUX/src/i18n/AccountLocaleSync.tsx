/**
 * Step 2 of the resolution order (see `LocaleProvider`): adopt the account's
 * language once, when the patient has never chosen one on this device.
 *
 * Renders nothing. It lives below `AuthProvider` because it needs to know a
 * patient session is live, and above the navigator so the shell is already in
 * the right language by the time the first tab paints.
 *
 * Deliberately silent on failure: a language is a preference, and a patient on
 * 2G must not see an error because a preference lookup timed out. They keep
 * the device/default locale and the picker still works.
 */
import { useEffect } from 'react';
import { fetchSettings } from '../api/dashboard';
import { useAuth } from '../context/AuthContext';
import { useLocale } from './LocaleProvider';

export function AccountLocaleSync() {
  const { sessionKind } = useAuth();
  const { ready, isExplicit, adoptAccountLocale } = useLocale();

  useEffect(() => {
    // `ready` gates on the stored choice having been read — adopting before
    // that would briefly override a choice the user already made.
    if (!ready || isExplicit || sessionKind !== 'patient') return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await fetchSettings();
        if (!cancelled) adoptAccountLocale(settings.settings.language);
      } catch {
        // See the note above.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, isExplicit, sessionKind, adoptAccountLocale]);

  return null;
}
