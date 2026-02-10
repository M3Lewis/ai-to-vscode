/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          // Override the project tsconfig for tests
          strict: true,
          module: 'commonjs',
          target: 'ES2020',
          lib: ['ES2020', 'DOM'],
          esModuleInterop: true,
          moduleResolution: 'node',
          skipLibCheck: true,
          types: ['jest'],
        },
      },
    ],
  },
};
