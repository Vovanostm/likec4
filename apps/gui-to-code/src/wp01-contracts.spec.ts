import type { ElementKind, Fqn } from '@likec4/core/types'
import { sourceRevision } from '@likec4/language-services/browser'
import { describe, expect, it } from 'vitest'
import { applyPlanToCandidate, canvasIntentToCommandCandidate } from './wp01-contracts'

describe('WP-01 owning contract proof', () => {
  it('maps canvas intents without applying semantic changes in diagram', () => {
    expect(canvasIntentToCommandCandidate({
      type: 'relation.create.requested',
      sourceId: 'shop' as Fqn,
      targetId: 'backend' as Fqn,
    })).toEqual({
      type: 'relation.create',
      sourceId: 'shop',
      targetId: 'backend',
    })

    expect(canvasIntentToCommandCandidate({
      type: 'element.create.requested',
      elementKind: 'system' as ElementKind,
      point: { x: 12, y: 24 },
    })).toEqual({
      type: 'element.create',
      elementKind: 'system',
      point: { x: 12, y: 24 },
    })
  })

  it('applies a source edit plan only to an in-memory candidate', () => {
    const source = 'model {\n}\n'
    const uri = 'file:///workspace/model.c4'
    const candidate = applyPlanToCandidate(source, uri, {
      baseRevisions: { [uri]: sourceRevision(source) },
      affectedDocuments: [uri],
      edits: [{
        uri,
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 0 },
        },
        newText: '  system shop\n',
      }],
    })

    expect(candidate).toBe('model {\n  system shop\n}\n')
    expect(source).toBe('model {\n}\n')
  })
})
