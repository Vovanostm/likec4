import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { technologyByName, technologyCatalogue, technologyFields } from './technology-catalogue'

describe('technology catalogue', () => {
  it('uses built-in technology identifiers accepted by the language server', () => {
    const registry = readFileSync(
      new URL('../../../../../packages/language-server/src/generated-lib/icons.ts', import.meta.url),
      'utf8',
    )
    for (const entry of technologyCatalogue) {
      expect(entry.icon.startsWith('tech:')).toBe(true)
      expect(registry).toContain(`"${entry.icon.slice('tech:'.length)}"`)
    }
  })

  it('recognizes trimmed case-insensitive names while preserving custom text', () => {
    expect(technologyByName('  pOsTgReSQL  ')?.icon).toBe('tech:postgresql')
    expect(technologyFields(' react ')).toEqual({ technology: ' react ', icon: 'tech:react' })
    expect(technologyFields('Свой движок')).toEqual({ technology: 'Свой движок', icon: null })
    expect(technologyFields('')).toEqual({ technology: '', icon: null })
  })
})
