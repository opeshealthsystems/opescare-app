import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Production runs in production mode and has no demo accounts, so the auth
 * screens carry no demo sign-in menu and no demo credentials at all — not
 * behind a flag, not in the bundle.
 */
const root = join(__dirname, '..');
const authDir = join(root, 'app', '(auth)');
const authScreens = readdirSync(authDir).filter((f) => f.endsWith('.tsx'));

describe('auth screens carry no demo sign-in', () => {
  it.each(authScreens)('%s has no demo menu, flag or credentials', (file) => {
    const src = readFileSync(join(authDir, file), 'utf8');
    expect(src).not.toMatch(/SHOW_DEMO_LOGINS|EXPO_PUBLIC_DEMO_LOGINS|DemoAccount|demoAccounts/);
    expect(src).not.toMatch(/demo1234|demo\.[a-z]+@opescare/i);
    expect(src).not.toMatch(/auth\.demoLogin|demoDoctorNotice/);
  });

  it('the demo credentials module is gone', () => {
    expect(existsSync(join(root, 'lib', 'auth', 'demoAccounts.ts'))).toBe(false);
  });

  it.each(['en', 'fr'])('%s catalogue has no demo sign-in strings', (lng) => {
    const src = readFileSync(join(root, 'lib', 'i18n', 'locales', `${lng}.json`), 'utf8');
    expect(src).not.toMatch(/"demoLogin\w*"|"demoDoctorNotice"/);
  });

  it('no EAS profile sets the demo-login flag', () => {
    expect(readFileSync(join(root, 'eas.json'), 'utf8')).not.toMatch(/EXPO_PUBLIC_DEMO_LOGINS/);
  });
});
