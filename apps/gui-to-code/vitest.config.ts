import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    conditions: ['sources', 'module', 'import', 'default'],
    alias: [
      {
        find: /^@likec4\/config$/,
        replacement: resolve(import.meta.dirname, '../../packages/config/src/index.ts'),
      },
      {
        find: /^@likec4\/config\/node$/,
        replacement: resolve(import.meta.dirname, '../../packages/config/src/node/index.ts'),
      },
      {
        find: /^@likec4\/core$/,
        replacement: resolve(import.meta.dirname, '../../packages/core/src/index.ts'),
      },
      {
        find: /^@likec4\/core\/builder$/,
        replacement: resolve(import.meta.dirname, '../../packages/core/src/builder/index.ts'),
      },
      {
        find: /^@likec4\/core\/compute-view$/,
        replacement: resolve(import.meta.dirname, '../../packages/core/src/compute-view/index.ts'),
      },
      {
        find: /^@likec4\/core\/geometry$/,
        replacement: resolve(import.meta.dirname, '../../packages/core/src/geometry/index.ts'),
      },
      {
        find: /^@likec4\/core\/model$/,
        replacement: resolve(import.meta.dirname, '../../packages/core/src/model/index.ts'),
      },
      {
        find: /^@likec4\/core\/styles$/,
        replacement: resolve(import.meta.dirname, '../../packages/core/src/styles/index.ts'),
      },
      {
        find: /^@likec4\/core\/types$/,
        replacement: resolve(import.meta.dirname, '../../packages/core/src/types/index.ts'),
      },
      {
        find: /^@likec4\/core\/utils\/graphology$/,
        replacement: resolve(import.meta.dirname, '../../packages/core/src/utils/graphology/index.ts'),
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
