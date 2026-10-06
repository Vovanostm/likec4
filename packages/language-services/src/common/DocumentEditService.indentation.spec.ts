import type { ElementKind, Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { fromSource } from '../node'
import { applyDocumentTextEdits, createDocumentEditService } from './DocumentEditService'

describe('DocumentEditService sibling insertion', () => {
  it.each(['  ', '\t'])('preserves closing-brace indentation across repeated moves with %j', async indent => {
    let source = `specification { element system element container }
model {
${indent}// Preserve this comment and the parent formatting.
${indent}system bank {
${indent}${indent}description 'Internet banking'
${indent}}
}
views { view index of bank { include * } }
`
    for (const id of ['web', 'api', 'statements', 'database', 'cache']) {
      let likec4 = await fromSource(source)
      let service = createDocumentEditService(likec4)
      const add = await service.planAddElement({ id, kind: 'container' as ElementKind })
      const uri = add.affectedDocuments[0]!
      source = applyDocumentTextEdits(source, add.edits, add.baseRevisions[uri]!)
      likec4 = await fromSource(source)
      service = createDocumentEditService(likec4)
      const move = await service.planMoveElement({ target: id as Fqn, parent: 'bank' as Fqn })
      source = applyDocumentTextEdits(source, move.edits, move.baseRevisions[uri]!)
      expect(source).toContain(`\n${indent}}\n}`)
      expect(source).toContain(`\n${indent}  container ${id}\n`)
    }
    expect(source).toContain(`${indent}// Preserve this comment and the parent formatting.`)
    const likec4 = await fromSource(source)
    expect(likec4.hasErrors()).toBe(false)
    expect([...(await likec4.parsedModel()).elements()]).toHaveLength(6)
  })
})
