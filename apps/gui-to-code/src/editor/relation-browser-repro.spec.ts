import type { ElementKind, Fqn, RelationId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { starterSource } from '../document'
import { languageServicesDocumentPort } from './language-services-adapter'

describe('browser relation creation after canvas element creation', () => {
  it('titles an untitled browser relation and preserves the other source document', async () => {
    const content = `specification { element system element container }
model {
  system = system { api = container database = container }
  system.api -> system.database
}
views { view index of system { include * } }
`
    const sources = [
      { uri: 'model.c4', content },
      { uri: 'other.c4', content: '// Preserve this document byte for byte\nmodel { external = system }\n' },
    ]
    const compiled = await compile({ revision: 0, sources })
    const relation = Object.values(compiled.model?.$data.relations ?? {})[0]
    if (!relation || !languageServicesDocumentPort.patchRelation) throw new Error('Expected editable browser relation')
    const next = await languageServicesDocumentPort.patchRelation(sources, {
      id: relation.id,
      sourceId: 'system.api' as Fqn,
      targetId: 'system.database' as Fqn,
      occurrence: 0,
      patch: { title: 'Запрос к базе' },
    })
    expect(next[0]?.content).toBe(
      content.replace('system.api -> system.database', 'system.api -> system.database \'Запрос к базе\''),
    )
    expect(next[1]).toEqual(sources[1])
    const patched = await compile({ revision: 1, sources: next })
    expect(patched.diagnostics).toEqual([])
    expect(patched.model?.$data.relations[relation.id]?.title).toBe('Запрос к базе')
  })

  it('creates a relation between elements added to the starter workspace', async () => {
    let sources = [{ uri: 'model.c4', content: starterSource }]

    for (
      const [id, kind] of [
        ['actor', 'actor'],
        ['system', 'system'],
        ['component', 'component'],
      ] as const
    ) {
      sources = [
        ...await languageServicesDocumentPort.createElement(sources, {
          id: id as unknown as Fqn,
          kind: kind as ElementKind,
          parentId: 'shop' as unknown as Fqn,
          documentUri: 'model.c4',
        }),
      ]
    }

    const compiled = await compile({ revision: 0, sources })
    expect(compiled.model).not.toBeNull()
    expect(Object.keys(compiled.model!.$data.elements)).toEqual(expect.arrayContaining([
      'shop.actor',
      'shop.system',
      'shop.component',
    ]))

    const next = await languageServicesDocumentPort.createRelation(sources, {
      sourceId: 'shop.component' as Fqn,
      targetId: 'shop.system' as Fqn,
      documentUri: 'model.c4',
    })

    expect(next[0]?.content).toContain('shop.component -> shop.system')
    const nextCompilation = await compile({ revision: 1, sources: next })
    expect(nextCompilation.model).not.toBeNull()
    const createdRelationId = Object.keys(nextCompilation.model!.$data.relations)
      .find(id => !Object.hasOwn(compiled.model!.$data.relations, id))
    expect(createdRelationId).toBeDefined()
    expect(
      nextCompilation.model!.$data.views['index']?.edges.some(edge =>
        edge.relations.includes(createdRelationId as RelationId)
      ),
    ).toBe(true)
  }, 15_000)
})
