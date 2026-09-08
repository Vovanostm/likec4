import type { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import type { MultiRemovalInspection } from './professional-removal'
import {
  inspectionHasUnsupportedDependencies,
  normalizeRemovalRoots,
} from './professional-removal'

describe('professional multi-removal contracts', () => {
  it('normalizes duplicates and descendants under a selected ancestor', () => {
    expect(normalizeRemovalRoots([
      'shop.web' as Fqn,
      'shop' as Fqn,
      'shop.api' as Fqn,
      'customer' as Fqn,
      'shop' as Fqn,
    ])).toEqual(['customer', 'shop'])
  })

  it('detects unsupported dependencies across all selected roots', () => {
    const inspection: MultiRemovalInspection = {
      revision: 4,
      roots: ['A' as Fqn, 'B' as Fqn],
      reports: [
        { target: 'A' as Fqn, revision: 'a', dependencies: [] },
        {
          target: 'B' as Fqn,
          revision: 'b',
          dependencies: [{
            id: 'unsupported:b',
            kind: 'semantic-reference',
            uri: 'model.c4',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
            removal: 'unsupported',
          }],
        },
      ],
    }
    expect(inspectionHasUnsupportedDependencies(inspection)).toBe(true)
  })
})
