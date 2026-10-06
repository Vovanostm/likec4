import type { ElementKind, Fqn, ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { inlineTitleContextIsCurrent } from './use-canvas-entity-editor'
import { EditorWorkspace } from './workspace'

const emptySource = `// Preserve imported source
specification {
  element service
  element database
}
model {}
views {}
`

// The integration path includes parser, Graphviz and repeated revision compilation.
describe('UX specification gates', { timeout: 15_000 }, () => {
  it('rejects retained inline drafts after same-revision replacement or a newer title', async () => {
    const content = emptySource.replace('model {}', 'model { api = service \'API\' }')
      .replace('views {}', 'views { view index { include * } }')
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content }], compile)
    const capture = { workspace: editor, revision: 0, id: 'api' as Fqn, baseTitle: 'API' }
    expect(inlineTitleContextIsCurrent(capture, editor)).toBe(true)
    const replacement = await EditorWorkspace.create([{ uri: 'model.c4', content }], compile)
    expect(inlineTitleContextIsCurrent(capture, replacement)).toBe(false)
    await editor.dispatch({
      id: 1,
      expectedRevision: 0,
      semantic: { type: 'element.patch', input: { id: 'api' as Fqn, patch: { title: 'Newer' } } },
    })
    expect(inlineTitleContextIsCurrent(capture, editor)).toBe(false)
  })
  it('probes first root visibility through the existing scoped view contract', async () => {
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: emptySource }], compile)
    expect(editor.state.compilation.status).toBe('valid')
    const created = await editor.dispatch({
      id: 1,
      expectedRevision: 0,
      semantic: { type: 'element.create', input: { kind: 'service' as ElementKind } },
    })
    expect(created.status).toBe('applied')
    if (created.status !== 'applied' || created.command !== 'element.create') throw new Error('Expected first element')
    const firstId = created.createdElementId
    const view = await editor.dispatch({
      id: 2,
      expectedRevision: 1,
      semantic: { type: 'view.create', input: { id: 'first', viewOf: firstId, documentUri: 'model.c4' } },
    })
    expect(view.status).toBe('applied')
    // A scoped view must actually display the first root for the guided bootstrap to be accepted.
    expect(editor.state.lastValidModel?.$data.views['first']?.nodes.some(node => node.modelRef === firstId)).toBe(true)
    const sources = editor.state.committedSources
    expect(editor.state.history.past).toHaveLength(2)
    await editor.undo(2)
    expect(editor.state.lastValidModel?.$data.views['first']).toBeUndefined()
    expect(editor.state.lastValidModel?.$data.elements[firstId]).toBeDefined()
    await editor.undo(3)
    expect(editor.state.committedSources[0]?.content).toBe(emptySource)
    await editor.redo(4)
    await editor.redo(5)
    expect(editor.state.committedSources).toEqual(sources)
    const before = editor.state
    expect(
      (await editor.dispatch({
        id: 3,
        expectedRevision: 6,
        semantic: { type: 'view.create', input: { id: 'bad id', viewOf: firstId, documentUri: 'model.c4' } },
      })).status,
    ).toBe('rejected')
    expect(editor.state).toBe(before)
  })

  it('creates declared custom kinds atomically and rejects unknown kinds', async () => {
    const content = emptySource.replace('model {}', 'model { api = service \'API\' }')
      .replace('views {}', 'views { view index { include * } }')
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content }], compile)
    const result = await editor.dispatch({
      id: 1,
      expectedRevision: 0,
      semantic: {
        type: 'element.createConnected',
        input: {
          kind: 'database' as ElementKind,
          sourceId: 'api' as Fqn,
          viewId: 'index' as ViewId,
          title: 'Хранилище',
          position: { x: 120, y: 200 },
        },
      },
    })
    expect(result.status).toBe('applied')
    const after = editor.state
    const rejected = await editor.dispatch({
      id: 2,
      expectedRevision: 1,
      semantic: { type: 'element.create', input: { kind: 'undeclared' as ElementKind } },
    })
    expect(rejected.status).toBe('rejected')
    expect(editor.state).toBe(after)
    await editor.undo(1)
    expect(editor.state.committedSources[0]?.content).toBe(content)
    expect(editor.state.manualLayouts).toEqual({})
    await editor.redo(2)
    expect(editor.state.committedSources).toEqual(after.committedSources)
    expect(editor.state.manualLayouts).toEqual(after.manualLayouts)
  })
})
