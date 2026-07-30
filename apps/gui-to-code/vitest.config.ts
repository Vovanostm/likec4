import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    conditions: ['sources', 'module', 'import', 'default'],
    alias: {
      '@likec4/language-server/browser': resolve(import.meta.dirname, '../../packages/language-server/src/browser/index.ts'),
      '@likec4/language-services/browser': resolve(import.meta.dirname, '../../packages/language-services/src/browser/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
