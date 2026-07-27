import { defineConfig } from '@likec4/styles/dev'

export default defineConfig({
  clean: true,
  include: ['src/**/*.{ts,tsx}', '../../packages/diagram/src/**/*.{ts,tsx}'],
  outdir: 'apps/gui-to-code/styled-system',
})
