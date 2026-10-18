/**
 * The demo sign-in gate, as pure functions so it can be unit-tested.
 *
 * app/(auth)/login.tsx keeps its own inline `__DEV__ || process.env...`
 * expression and inline `require` on purpose: Metro only drops the demo
 * credentials module from a release bundle when the condition is a literal it
 * can constant-fold at the call site. These helpers state the same rule and
 * __tests__/demoGate.test.ts checks that login.tsx still matches it.
 */
export function isDemoLoginEnabled(isDev: boolean, demoFlag: string | undefined): boolean {
  return isDev || demoFlag === '1' || demoFlag === 'true';
}

/** Demo accounts are only loaded — and only non-empty — when the gate is open. */
export function demoAccountsFor<T>(enabled: boolean, load: () => readonly T[]): readonly T[] {
  return enabled ? load() : [];
}
