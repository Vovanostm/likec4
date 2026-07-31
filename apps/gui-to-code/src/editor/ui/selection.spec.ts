import type { LikeC4Model } from '@likec4/core/model'
import type { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import type { EditorWorkspaceState } from '../contracts'
import {
  buildStructureTree,
  parentOptions,
  reconcileSelection,
  selectionAfterResult,
} from './selection'

function stateWith(ids: readonly string[]): EditorWorkspaceState {
  const elements = Object.fromEntries(ids.map(id => [id, { id, title: id, kind: 'system' }]))
  const model = {
    $data: {
      elements,
      relations: {},
      views: {},
      specification: { elements: {} },
    },
  } as unknown as LikeC4Model.Layouted
  return {
    version: 2,
    projectId: 'default',
    revision: 0,
    committedSources: [],
    draftSources: [],
    manualLayouts: {},
    compilation: { revision: 0, status: 'valid', diagnostics: [], model },
    lastValidModel: model,
    history: { past: [], future: [] },
  }
}

describe('selection helpers', () => {
  it('builds a recursive logical tree from FQNs', () => {
    const tree = buildStructureTree(stateWith(['shop.web', 'shop', 'shop.api', 'platform']))
    expect(tree.map(node => node.id)).toEqual(['platform', 'shop'])
    expect(tree[1]?.children.map(node => node.id)).toEqual(['shop.api', 'shop.web'])
  })

  it('excludes target and descendants from parent options', () => {
    const options = parentOptions(stateWith(['shop', 'shop.web', 'shop.web.client', 'platform']), 'shop.web' as Fqn)
    expect(options.map(option => option.id)).toEqual(['platform', 'shop'])
  })

  it('remaps selection after rename and clears after remove', () => {
    const renamedState = stateWith(['store'])
    const renamed = selectionAfterResult(
      { type: 'element', id: 'shop' as Fqn },
      { status: 'applied', command: 'element.rename', revision: 1, updatedElementId: 'store' as Fqn },
      renamedState,
    )
    expect(renamed).toEqual({ type: 'element', id: 'store' })

    expect(selectionAfterResult(
      renamed,
      { status: 'applied', command: 'element.remove', revision: 2, removedElementId: 'store' as Fqn },
      stateWith([]),
    )).toBeNull()
  })

  it('keeps selection for view and layout operations', () => {
    const state = stateWith(['shop'])
    const selection = { type: 'element' as const, id: 'shop' as Fqn }
    expect(selectionAfterResult(
      selection,
      { status: 'applied', command: 'view.create', revision: 1, createdViewId: 'shop_view' as never },
      state,
    )).toEqual(selection)
    expect(selectionAfterResult(
      selection,
      { status: 'applied', command: 'layout.reset', revision: 2, viewId: 'index' as never },
      state,
    )).toEqual(selection)
  })

  it('clears stale selection after direct source deletion', () => {
    expect(reconcileSelection({ type: 'element', id: 'missing' as Fqn }, stateWith(['shop']))).toBeNull()
  })
})
