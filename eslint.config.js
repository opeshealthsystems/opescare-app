// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const globals = require('globals');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'UIUX/*', 'playstore/*', 'coverage/*', '.expo/*', 'Health ID retuned/*'],
  },
  {
    // The React Compiler is not enabled in this app (no babel-plugin-react-compiler),
    // so its advisory diagnostics are reported as warnings, not errors. They flag
    // patterns the compiler cannot optimise, not runtime bugs.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    // Node-side config files.
    files: ['app.config.js', '*.config.js', 'scripts/**', 'plugins/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['__tests__/**', 'jest.setup.js'],
    languageOptions: { globals: { ...globals.jest } },
  },
  {
    // False positive: `useMyLocation` here is a useCallback handler, not a hook,
    // so calling it from onPress is correct. Renaming it belongs to the screen's
    // owner; until then the rule is off for this one file.
    files: ['app/blood-finder.tsx'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
]);
