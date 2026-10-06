import type { ElementKind } from '@likec4/core/types'
import { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { fromSource } from '../node'
import { applyDocumentTextEdits, createDocumentEditService } from './DocumentEditService'

describe('source-preserving element kind and style settings', () => {
  it.each([
    'component api \'API\'',
    'api = component \'API\'',
    'api = component \'API\' { #backend\n description \'Keep\'\n }',
    'api = component \'API\' { style { border dashed }\n component child \'Child\'\n }',
    'api = component \'API\' { style { color: /* note */ blue; shape rectangle; border dashed } }',
  ])('changes only the targeted kind and style in %s', async declaration => {
    const source = `specification {
  element component
  element database { style { shape cylinder } }
  tag backend
  color brand #ff00aa
}
model {
  // Preserve comment
  ${declaration}
  component other 'Other'
  api -> other 'Keep relation'
}
views { view index { include * } }
`
    const likec4 = await fromSource(source)
    expect(likec4.hasErrors()).toBe(false)
    const plan = await createDocumentEditService(likec4).planPatchElement({
      target: Fqn('api'),
      patch: { kind: 'database' as ElementKind, shape: 'cylinder', color: 'red' },
    })
    const uri = plan.affectedDocuments[0]!
    const candidate = applyDocumentTextEdits(source, plan.edits, plan.baseRevisions[uri]!)
    expect(candidate).toContain('// Preserve comment')
    expect(candidate).toContain('component other \'Other\'')
    expect(candidate).toContain('api -> other \'Keep relation\'')
    const retained = ['border dashed', '/* note */', 'component child \'Child\'', 'description \'Keep\'']
      .filter(property => source.includes(property))
    expect(retained.filter(property => !candidate.includes(property))).toEqual([])
    const updated = await fromSource(candidate)
    expect(updated.hasErrors()).toBe(false)
    expect((await updated.parsedModel()).$data.elements['api']).toMatchObject({
      kind: 'database',
      title: 'API',
      style: { shape: 'cylinder', color: 'red' },
    })
  })

  it('replaces a custom color value while preserving colon, semicolon and comments exactly', async () => {
    const source = `specification { element component color brand #ff00aa }
model { api = component { style { color: /* before */ brand; // after
  shape rectangle
} } }
views { view index { include * } }
`
    const service = createDocumentEditService(await fromSource(source))
    const plan = await service.planPatchElement({ target: Fqn('api'), patch: { color: 'green' } })
    const uri = plan.affectedDocuments[0]!
    const candidate = applyDocumentTextEdits(source, plan.edits, plan.baseRevisions[uri]!)
    expect(candidate).toBe(source.replace('/* before */ brand', '/* before */ green'))
    expect((await fromSource(candidate)).hasErrors()).toBe(false)
  })

  it('rejects an undeclared kind before planning an edit', async () => {
    const service = createDocumentEditService(
      await fromSource('specification { element component } model { api = component }'),
    )
    await expect(service.planPatchElement({ target: Fqn('api'), patch: { kind: 'missing' as ElementKind } }))
      .rejects.toMatchObject({ code: 'invalid-operation' })
  })
})
