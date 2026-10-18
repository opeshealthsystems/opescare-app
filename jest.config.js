/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ["<rootDir>/__tests__/**/*.test.ts?(x)"],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/UIUX/'],
};
