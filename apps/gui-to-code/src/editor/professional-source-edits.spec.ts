import type { ElementKind, Fqn, ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { starterSource } from '../document'
import type { PasteSubgraphPlan } from './professional-clipboard'
import { mergeRemovalPlans, professionalSourceEditPort } from './professional-source-edits'

const sources = [{ uri: 'model.c4', content: 'abcdef\n' }]
const uri = 'virtual:/workspace/model.c4'
const range = (start: number, end: number) => ({
  start: { line: 0, character: start },
  end: { line: 0, character: end },
})

describe('professional clipboard source planning', () => {
  it('duplicates a nested starter element through typed source planners', async () => {
    const plan: PasteSubgraphPlan = {
      viewId: 'index' as ViewId,
      documentUri: 'model.c4',
      elements: [{
        sourceId: 'shop.web' as Fqn,
        id: 'web2',
        createdId: 'shop.web2' as Fqn,
        kind: 'component' as ElementKind,
        title: 'Web application',
        description: null,
        technology: null,
        tags: [],
        parentId: 'shop' as Fqn,
        position: { x: 24, y: 24 },
      }],
      relations: [],
    }

    const candidate = await professionalSourceEditPort.createSubgraph(
      [{ uri: 'model.c4', content: starterSource }],
      plan,
    )
    expect(candidate[0]?.content).toContain("web2 = component 'Web application'")
    expect(candidate[0]?.content).toContain("web = component 'Web application'")
  })
})

describe('professional removal source composition', () => {
  it('deduplicates contained deletions from independent dependency reports', () => {
    const merged = mergeRemovalPlans(sources, [
      { baseRevisions: { [uri]: 'same' }, edits: [{ uri, range: range(1, 5), newText: '' }] },
      { baseRevisions: { [uri]: 'same' }, edits: [{ uri, range: range(2, 3), newText: '' }] },
    ])
    expect(merged.edits).toEqual([{ uri, range: range(1, 5), newText: '' }])
  })

  it('rejects partially overlapping edits instead of guessing an order', () => {
    expect(() => mergeRemovalPlans(sources, [
      { baseRevisions: { [uri]: 'same' }, edits: [{ uri, range: range(1, 4), newText: '' }] },
      { baseRevisions: { [uri]: 'same' }, edits: [{ uri, range: range(3, 6), newText: '' }] },
    ])).toThrow(/overlapping/i)
  })

  it('rejects plans built against different source revisions', () => {
    expect(() => mergeRemovalPlans(sources, [
      { baseRevisions: { [uri]: 'one' }, edits: [] },
      { baseRevisions: { [uri]: 'two' }, edits: [] },
    ])).toThrow(/revision/i)
  })
})
