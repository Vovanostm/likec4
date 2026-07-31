import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    conditions: ['sources', 'module', 'import', 'default'],
    alias: [
      {
        find: /^@likec4\/core$/,
        replacement: resolve(import.meta.dirname, '../../packages/core/src/index.ts'),
      },
      {
        find: /^@likec4\/core\/model$/,
        replacement: resolve(import.meta.dirname, '../../packages/core/src/model/index.ts'),
      },
      {
        find: /^@likec4\/core\/types$/,
        replacement: resolve(import.meta.dirname, '../../packages/core/src/types/index.ts'),
      },
      {
        find: /^@likec4\/core\/utils$/,
        replacement: resolve(import.meta.dirname, '../../packages/core/src/utils/index.ts'),
      },
      {
        find: /^@likec4\/layouts$/,
        replacement: resolve(import.meta.dirname, '../../packages/layouts/src/index.ts'),
      },
      {
        find: /^@likec4\/log$/,
        replacement: resolve(import.meta.dirname, '../../packages/log/src/index.ts'),
      },
      {
        find: '@likec4/language-server/browser',
        replacement: resolve(import.meta.dirname, '../../packages/language-server/src/browser/index.ts'),
      },
      {
        find: '@likec4/language-services/browser',
        replacement: resolve(import.meta.dirname, '../../packages/language-services/src/browser/index.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
