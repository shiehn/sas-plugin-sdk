/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: { jsx: 'react-jsx', module: 'commonjs', moduleResolution: 'node' } },
    ],
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
