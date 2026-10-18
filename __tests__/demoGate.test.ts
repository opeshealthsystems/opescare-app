import { readFileSync } from 'fs';
import { join } from 'path';
import { demoAccountsFor, isDemoLoginEnabled } from '@/lib/auth/demoGate';

describe('demo login gate', () => {
  it.each([
    [false, undefined, false],
    [false, '', false],
    [false, '0', false],
    [false, 'false', false],
    [false, 'yes', false],
    [false, 'TRUE', false],
    [false, '1', true],
    [false, 'true', true],
    [true, undefined, true],
  ])('dev=%s flag=%s -> %s', (dev, flag, expected) => {
    expect(isDemoLoginEnabled(dev, flag)).toBe(expected);
  });

  it('returns no accounts and never loads the module when the gate is closed', () => {
    const load = jest.fn(() => [{ email: 'demo@x' }]);
    expect(demoAccountsFor(false, load)).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it('loads the accounts when the gate is open', () => {
    const load = jest.fn(() => [{ email: 'demo@x' }]);
    expect(demoAccountsFor(true, load)).toHaveLength(1);
  });

  it('login.tsx keeps the same gate and only requires demo accounts behind it', () => {
    const src = readFileSync(join(__dirname, '..', 'app', '(auth)', 'login.tsx'), 'utf8');
    expect(src).toMatch(
      /SHOW_DEMO_LOGINS\s*=\s*__DEV__\s*\|\|\s*process\.env\.EXPO_PUBLIC_DEMO_LOGINS === '1'\s*\|\|\s*process\.env\.EXPO_PUBLIC_DEMO_LOGINS === 'true'/,
    );
    expect(src).toMatch(
      /DEMO_ACCOUNTS[^=]*=\s*SHOW_DEMO_LOGINS\s*\?[\s\S]{0,120}require\('@\/lib\/auth\/demoAccounts'\)\.DEMO_ACCOUNTS\s*:\s*\[\]/,
    );
    // `import type` is erased at build time; a value import would bundle the credentials.
    expect(src).not.toMatch(/^import (?!type )[^;]*from '@\/lib\/auth\/demoAccounts'/m);
  });
});
