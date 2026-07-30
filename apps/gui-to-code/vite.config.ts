import pandaCss from '@pandacss/dev/postcss'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  css: {
    postcss: {
      plugins: [pandaCss() as never],
    },
  },
  plugins: [react()],
  resolve: {
    conditions: ['sources', 'module', 'import', 'default'],
    dedupe: ['react', 'react-dom'],
    alias: {
      '@likec4/style-preset': resolve(import.meta.dirname, '../../styled-system/preset/src'),
    },
  },
})
