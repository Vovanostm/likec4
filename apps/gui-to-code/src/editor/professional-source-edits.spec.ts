import { describe, expect, it } from 'vitest'
import { mergeRemovalPlans } from './professional-source-edits'

const sources = [{ uri: 'model.c4', content: 'abcdef\n' }]
const uri = 'virtual:/workspace/model.c4'
const range = (start: number, end: number) => ({
  start: { line: 0, character: start },
  end: { line: 0, character: end },
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
