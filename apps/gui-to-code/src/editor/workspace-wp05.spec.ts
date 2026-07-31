import type { Fqn, ViewId, ViewManualLayoutSnapshot } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { starterSource } from '../document'
import type { EditorOperation, LayoutCommand } from './contracts'
import { snapshotFromLayout } from './layout-snapshots'
import { EditorWorkspace } from './workspace'

const sourceFile = { uri: 'model.c4', content: starterSource }
const indexViewId = 'index' as ViewId

function layoutOperation(layout: LayoutCommand, expectedRevision: number, id = expectedRevision + 1): EditorOperation {
  return { id, expectedRevision, layout }
}

async function workspace() {
  return EditorWorkspace.create([sourceFile], compile)
}

function indexSnapshot(editor: Awaited<ReturnType<typeof workspace>>): ViewManualLayoutSnapshot {
  const view = editor.state.lastValidModel?.$data.views[indexViewId]
  if (!view) throw new Error('Expected the starter index view')
  return snapshotFromLayout(view)
}

describe('EditorWorkspace WP-05 views and manual layouts', () => {
  it('creates one scoped view and restores byte-exact sources through Undo/Redo', async () => {
    const editor = await workspace()
    const original = editor.state.committedSources[0]?.content

    const created = await editor.dispatch({
      id: 1,
      expectedRevision: 0,
      semantic: {
        type: 'view.create',
        input: {
          id: 'shop_overview',
          title: 'Shop overview',
          viewOf: 'shop' as Fqn,
          documentUri: 'model.c4',
        },
      },
    })

    expect(created).toEqual({
      status: 'applied',
      command: 'view.create',
      revision: 1,
      createdViewId: 'shop_overview',
    })
    expect(editor.state.history.past).toHaveLength(1)
    expect(editor.state.committedSources[0]?.content).toContain('view shop_overview of shop')
    expect(editor.state.lastValidModel?.$data.views['shop_overview']).toMatchObject({
      _type: 'element',
      viewOf: 'shop',
    })

    expect(await editor.undo(1)).toEqual({ status: 'applied', command: 'history.undo', revision: 2 })
    expect(editor.state.committedSources[0]?.content).toBe(original)
    expect(editor.state.lastValidModel?.$data.views['shop_overview']).toBeUndefined()

    expect(await editor.redo(2)).toEqual({ status: 'applied', command: 'history.redo', revision: 3 })
    expect(editor.state.committedSources[0]?.content).toContain('view shop_overview of shop')
  })

  it('saves, resets and restores layout without changing semantic sources', async () => {
    const editor = await workspace()
    const original = editor.state.committedSources[0]?.content
    const snapshot = indexSnapshot(editor)

    expect(await editor.dispatch(layoutOperation({
      type: 'layout.save',
      input: { viewId: indexViewId, snapshot },
    }, 0))).toEqual({
      status: 'applied',
      command: 'layout.save',
      revision: 1,
      viewId: indexViewId,
    })
    expect(editor.state.committedSources[0]?.content).toBe(original)
    expect(editor.state.manualLayouts[indexViewId]).toEqual(snapshot)
    expect(editor.state.lastValidModel?.$data.views[indexViewId]?._layout).toBe('manual')

    expect(await editor.undo(1)).toEqual({ status: 'applied', command: 'history.undo', revision: 2 })
    expect(editor.state.manualLayouts[indexViewId]).toBeUndefined()
    expect(editor.state.committedSources[0]?.content).toBe(original)

    expect(await editor.redo(2)).toEqual({ status: 'applied', command: 'history.redo', revision: 3 })
    expect(editor.state.manualLayouts[indexViewId]).toEqual(snapshot)

    expect(await editor.dispatch(layoutOperation({
      type: 'layout.reset',
      input: { viewId: indexViewId },
    }, 3, 4))).toEqual({
      status: 'applied',
      command: 'layout.reset',
      revision: 4,
      viewId: indexViewId,
    })
    expect(editor.state.manualLayouts[indexViewId]).toBeUndefined()
    expect(editor.state.committedSources[0]?.content).toBe(original)

    expect(await editor.undo(4)).toEqual({ status: 'applied', command: 'history.undo', revision: 5 })
    expect(editor.state.manualLayouts[indexViewId]).toEqual(snapshot)
  })

  it('keeps sources and layouts atomic across semantic and layout history', async () => {
    const editor = await workspace()
    const original = editor.state.committedSources[0]?.content
    const snapshot = indexSnapshot(editor)

    await editor.dispatch(layoutOperation({
      type: 'layout.save',
      input: { viewId: indexViewId, snapshot },
    }, 0))
    await editor.dispatch({
      id: 2,
      expectedRevision: 1,
      semantic: {
        type: 'view.create',
        input: { id: 'web', viewOf: 'shop.web' as Fqn, documentUri: 'model.c4' },
      },
    })

    expect(editor.state.manualLayouts[indexViewId]).toEqual(snapshot)
    expect(editor.state.committedSources[0]?.content).toContain('view web of shop.web')

    await editor.undo(2)
    expect(editor.state.manualLayouts[indexViewId]).toEqual(snapshot)
    expect(editor.state.committedSources[0]?.content).toBe(original)

    await editor.undo(3)
    expect(editor.state.manualLayouts[indexViewId]).toBeUndefined()
    expect(editor.state.committedSources[0]?.content).toBe(original)

    await editor.redo(4)
    expect(editor.state.manualLayouts[indexViewId]).toEqual(snapshot)
    expect(editor.state.committedSources[0]?.content).toBe(original)
  })

  it('rejects stale, mismatched and malformed snapshots without mutation', async () => {
    const editor = await workspace()
    const snapshot = indexSnapshot(editor)
    const before = editor.state

    expect(await editor.dispatch(layoutOperation({
      type: 'layout.save',
      input: { viewId: indexViewId, snapshot },
    }, 99))).toEqual({ status: 'conflict', revision: 0 })
    expect(editor.state).toBe(before)

    const wrongView = { ...snapshot, id: 'other' as ViewId }
    expect(await editor.dispatch(layoutOperation({
      type: 'layout.save',
      input: { viewId: indexViewId, snapshot: wrongView },
    }, 0, 2))).toMatchObject({
      status: 'rejected',
      issues: [{ code: 'layout-view-mismatch' }],
    })
    expect(editor.state).toBe(before)

    const malformed = { ...snapshot, nodes: null } as unknown as ViewManualLayoutSnapshot
    expect(await editor.dispatch(layoutOperation({
      type: 'layout.save',
      input: { viewId: indexViewId, snapshot: malformed },
    }, 0, 3))).toMatchObject({
      status: 'rejected',
      issues: [{ code: 'layout-snapshot-invalid' }],
    })
    expect(editor.state).toBe(before)
  })

  it('preserves the snapshot and exposes core drift after a semantic change', async () => {
    const editor = await workspace()
    const snapshot = indexSnapshot(editor)
    await editor.dispatch(layoutOperation({
      type: 'layout.save',
      input: { viewId: indexViewId, snapshot },
    }, 0))

    const changedSource = starterSource.replace(
      "    web = component 'Web application'",
      "    api = component 'API'\n    web = component 'Web application'",
    )
    await editor.updateDraft([{ uri: 'model.c4', content: changedSource }])

    expect(editor.state.revision).toBe(2)
    expect(editor.state.manualLayouts[indexViewId]).toEqual(snapshot)
    expect(editor.state.lastValidModel?.$data.views[indexViewId]?.drifts).toContain('nodes-added')

    await editor.updateDraft([{ uri: 'model.c4', content: 'invalid' }])
    expect(editor.state.compilation.status).toBe('invalid')
    expect(editor.state.manualLayouts[indexViewId]).toEqual(snapshot)
    expect(editor.state.lastValidModel?.$data.views[indexViewId]?._layout).toBe('manual')
  })
})
