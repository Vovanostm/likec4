import type { RelationId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { fromSources } from '../node'
import { applyDocumentTextEdits, createDocumentEditService } from './DocumentEditService'
import type { SourceEditPlan } from './DocumentEditService'

const source = `specification { element system element component }
model {
  shop = system {
    web = component
  }
  customer = system
  // web -> customer must remain a comment
  web -> customer 'First'
  web -> customer {
    // preserve this comment and the technology
    title "Second"
    technology 'HTTP'
  }
}
`

function apply(source: string, plan: SourceEditPlan): string {
  const uri = plan.affectedDocuments[0]!
  return applyDocumentTextEdits(source, plan.edits.filter(edit => edit.uri === uri), plan.baseRevisions[uri]!)
}

async function fixture(content = source) {
  const likec4 = await fromSources({ 'nested/model.c4': content })
  const model = await likec4.parsedModel()
  return { service: createDocumentEditService(likec4), relations: Object.values(model.$data.relations) }
}

describe('parser-owned logical relation edits', () => {
  it('patches shorthand references to a nested element and preserves comments', async () => {
    const { service, relations } = await fixture()
    const candidate = apply(
      source,
      await service.planPatchRelation({
        id: relations[0]!.id,
        patch: { title: 'Updated' },
      }),
    )
    expect(candidate).toBe(source.replace('\'First\'', '\'Updated\''))
    const reparsed = await fromSources({ 'nested/model.c4': candidate })
    expect(reparsed.hasErrors()).toBe(false)
    expect(Object.values((await reparsed.parsedModel()).$data.relations)[0]?.title).toBe('Updated')
  })

  it('patches only the selected duplicate body title and preserves its quotes and technology', async () => {
    const { service, relations } = await fixture()
    const candidate = apply(
      source,
      await service.planPatchRelation({
        id: relations[1]!.id,
        patch: { title: 'Updated duplicate' },
      }),
    )
    expect(candidate).toBe(source.replace('"Second"', '"Updated duplicate"'))
  })

  it('removes only the selected duplicate declaration', async () => {
    const { service, relations } = await fixture()
    const candidate = apply(source, await service.planRemoveRelation({ id: relations[0]!.id }))
    expect(candidate).toBe(source.replace('  web -> customer \'First\'\n', ''))
    const reparsed = await fromSources({ 'nested/model.c4': candidate })
    expect(reparsed.hasErrors()).toBe(false)
    expect(Object.values((await reparsed.parsedModel()).$data.relations).map(relation => relation.title)).toEqual([
      'Second',
    ])
  })

  it('inserts an escaped title for an untitled relation without changing unrelated source', async () => {
    const content = source.replace('web -> customer \'First\'', 'web -> customer')
    const { service, relations } = await fixture(content)
    const candidate = apply(
      content,
      await service.planPatchRelation({
        id: relations[0]!.id,
        patch: { title: 'Customer\'s orders' },
      }),
    )
    expect(candidate).toBe(content.replace('  web -> customer\n', '  web -> customer \'Customer\\\'s orders\'\n'))
    const reparsed = await fromSources({ 'nested/model.c4': candidate })
    expect(reparsed.hasErrors()).toBe(false)
  })

  it('fails closed for missing identities and empty titles', async () => {
    const { service, relations } = await fixture()
    await expect(service.planRemoveRelation({ id: 'missing' as RelationId }))
      .rejects.toMatchObject({ code: 'not-found' })
    await expect(service.planPatchRelation({ id: relations[0]!.id, patch: { title: '  ' } }))
      .rejects.toMatchObject({ code: 'invalid-title' })
  })
  it.each([
    'web -> customer',
    'web -> customer \'First\'',
    'web -> customer \'First\' \'Old description\' \'Old technology\'',
    'web -> customer \'First\' #old { #old technology \'Old technology\' }',
  ])('patches metadata and clears tags for %s without changing a duplicate', async declaration => {
    const content = source.replace('element component }', 'element component tag old tag new }')
      .replace('web -> customer \'First\'', declaration)
    const { service, relations } = await fixture(content)
    const candidate = apply(
      content,
      await service.planPatchRelation({
        id: relations[0]!.id,
        patch: { title: 'Metadata', description: 'Line one\nLine two', technology: 'HTTPS', tags: ['new'] },
      }),
    )
    const reparsed = await fromSources({ 'nested/model.c4': candidate })
    expect(reparsed.hasErrors()).toBe(false)
    const after = Object.values((await reparsed.parsedModel()).$data.relations)
    expect(after[0]).toMatchObject({ title: 'Metadata', technology: 'HTTPS', tags: ['new'] })
    expect(after[1]).toEqual(relations[1])
    expect(candidate).toContain('// preserve this comment and the technology')
    const clear = apply(
      candidate,
      await createDocumentEditService(reparsed).planPatchRelation({
        id: after[0]!.id,
        patch: { description: null, technology: null, tags: [] },
      }),
    )
    const cleared = await fromSources({ 'nested/model.c4': clear })
    expect(cleared.hasErrors()).toBe(false)
    const result = Object.values((await cleared.parsedModel()).$data.relations)[0]!
    expect(result.tags ?? []).toEqual([])
    expect(result.technology ?? '').toBe('')
  })

  it('rejects unknown relation tags without returning edits', async () => {
    const { service, relations } = await fixture()
    await expect(service.planPatchRelation({ id: relations[0]!.id, patch: { tags: ['missing'] } }))
      .rejects.toMatchObject({ code: 'invalid-tag' })
  })

  it('adds tags to the specification document and rejects duplicates and malformed names', async () => {
    const likec4 = await fromSources({
      'spec.c4': '// preserve specification\nspecification { element system }',
      'model.c4': '// unchanged model\nmodel { a = system }',
    })
    const service = createDocumentEditService(likec4)
    await expect(service.planAddTag({ name: 'bad name' })).rejects.toMatchObject({ code: 'invalid-identifier' })
    const plan = await service.planAddTag({ name: 'backend' })
    expect(plan.affectedDocuments).toHaveLength(1)
    const uri = plan.affectedDocuments[0]!
    expect(uri).toContain('spec.c4')
    const next = apply('// preserve specification\nspecification { element system }', plan)
    expect(next).toContain('// preserve specification')
    const reparsed = await fromSources({ 'spec.c4': next, 'model.c4': 'model { a = system }' })
    expect(reparsed.hasErrors()).toBe(false)
    expect((await reparsed.parsedModel()).$data.specification.tags).toHaveProperty('backend')
    await expect(createDocumentEditService(reparsed).planAddTag({ name: 'backend' }))
      .rejects.toMatchObject({ code: 'collision' })
  })
})
