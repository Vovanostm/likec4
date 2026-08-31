import type { RelationId, ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { edgeSelectionContextIsCurrent } from './use-canvas-entity-editor'

describe('canvas edge interaction freshness', () => {
  const selection = {
    family: 'logical-relation' as const,
    viewId: 'index' as ViewId,
    revision: 7,
    id: 'relation-id' as RelationId,
  }

  it('accepts only the exact captured revision and view', () => {
    expect(edgeSelectionContextIsCurrent(selection, 7, 'index' as ViewId)).toBe(true)
  })

  it('fails closed after the workspace revision changes', () => {
    expect(edgeSelectionContextIsCurrent(selection, 8, 'index' as ViewId)).toBe(false)
  })

  it('fails closed after the current view changes or disappears', () => {
    expect(edgeSelectionContextIsCurrent(selection, 7, 'other' as ViewId)).toBe(false)
    expect(edgeSelectionContextIsCurrent(selection, 7, null)).toBe(false)
  })
})
