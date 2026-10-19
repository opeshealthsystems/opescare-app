import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Functional audit 2026-10-19 (docs/FUNCTIONAL_AUDIT.md): these mutations used to
 * fail silently (no onError, no isError on screen) or leak an unhandled promise
 * rejection. Guard the fix at source level so a refactor cannot drop it.
 */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

function mutateCallsWithoutOnError(src: string, name: string): number {
  const lines = src.split('\n');
  let bad = 0;
  lines.forEach((line, i) => {
    if (!line.includes(`${name}.mutate(`)) return;
    const window = lines.slice(i, i + 10).join('\n');
    if (!window.includes('onError')) bad += 1;
  });
  return bad;
}

describe('mutation failures reach the user', () => {
  it('donor pause/resume/withdraw report failure', () => {
    const src = read('app/blood-finder/become-donor.tsx');
    expect(src).toContain('setStatus.mutate(');
    expect(mutateCallsWithoutOnError(src, 'setStatus')).toBe(0);
  });

  it('blood request cancel reports failure', () => {
    const src = read('app/blood-finder/modify.tsx');
    expect(src).toContain('cancel.mutate(');
    expect(mutateCallsWithoutOnError(src, 'cancel')).toBe(0);
  });

  it('passport QR mint never leaks an unhandled rejection', () => {
    const src = read('components/passport/VerificationCentre.tsx');
    expect(src).toMatch(/try\s*\{\s*minted = await mint\.mutateAsync\(\);\s*\}\s*catch/);
  });
});
