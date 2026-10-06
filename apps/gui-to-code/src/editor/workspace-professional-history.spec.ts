import { Fqn, ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { starterSource } from '../document'
import { captureCanvasClipboard } from './professional-clipboard'
import { EditorWorkspace } from './workspace'

describe('professional canvas workspace history', () => {
  it('pastes and removes through the workspace with atomic Undo/Redo and history labels', async () => {
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    const before = structuredClone(editor.state.committedSources)
    const clipboard = captureCanvasClipboard(editor.state, ViewId('index'), new Set(['shop.web']))
    expect(clipboard).not.toBeNull()
    if (!clipboard) throw new Error('Expected clipboard selection')
    const pasted = await editor.pasteSubgraph({
      clipboard,
      viewId: ViewId('index'),
      documentUri: 'model.c4',
    }, editor.state.revision)
    expect(pasted.status).toBe('applied')
    if (pasted.status !== 'applied') throw new Error(JSON.stringify(pasted))
    expect(editor.state.history.current.type).toBe('subgraph.paste')
    expect(editor.state.history.current.label).toBe('Вставка элементов')
    const afterPaste = structuredClone(editor.state.committedSources)
    const pastedLayouts = structuredClone(editor.state.manualLayouts)
    expect(await editor.undo(editor.state.revision)).toMatchObject({ status: 'applied' })
    expect(editor.state.committedSources).toEqual(before)
    expect(await editor.redo(editor.state.revision)).toMatchObject({ status: 'applied' })
    expect(editor.state.committedSources).toEqual(afterPaste)
    expect(editor.state.manualLayouts).toEqual(pastedLayouts)
    const inspected = await editor.inspectSubgraphRemoval(
      [Fqn('shop.web'), ...pasted.createdElementIds],
      editor.state.revision,
    )
    expect(inspected.status).toBe('ready')
    if (inspected.status !== 'ready') throw new Error(JSON.stringify(inspected))
    expect(await editor.removeSubgraph(inspected.inspection, editor.state.revision)).toMatchObject({
      status: 'applied',
    })
    expect(editor.state.history.current.type).toBe('subgraph.remove')
    expect(editor.state.lastValidModel?.$data.elements[Fqn('shop.web')]).toBeUndefined()
    expect(await editor.undo(editor.state.revision)).toMatchObject({ status: 'applied' })
    expect(editor.state.committedSources).toEqual(afterPaste)
    expect(editor.state.manualLayouts).toEqual(pastedLayouts)
    expect(await editor.removeSubgraph(inspected.inspection, inspected.inspection.revision)).toMatchObject({
      status: 'conflict',
    })
    expect(editor.state.committedSources).toEqual(afterPaste)
  }, 30_000)
})
