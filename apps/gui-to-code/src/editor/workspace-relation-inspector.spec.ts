import type { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { starterSource } from '../document'
import { EditorWorkspace } from './workspace'

describe('relation inspector after workspace reload', () => {
  it('patches/removes starter shorthand relations and restores exact source with Undo/Redo', async () => {
    const initial = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    const changed = await initial.dispatch({
      id: 1,
      expectedRevision: initial.state.revision,
      semantic: { type: 'element.patch', input: { id: 'customer' as Fqn, patch: { title: 'Покупатель' } } },
    })
    expect(changed.status).toBe('applied')
    const before = initial.state.committedSources
    const editor = await EditorWorkspace.create(before, compile)
    const relation = Object.values(editor.state.lastValidModel!.$data.relations).find(r => r.title === 'shows orders')!
    const patched = await editor.dispatch({
      id: 2,
      expectedRevision: editor.state.revision,
      semantic: { type: 'relation.patch', input: { id: relation.id, patch: { title: 'Показывает заказы' } } },
    })
    expect(patched.status).toBe('applied')
    const after = editor.state.committedSources
    expect(after[0]?.content).toContain('web -> customer \'Показывает заказы\'')
    expect((await editor.undo(editor.state.revision)).status).toBe('applied')
    expect(editor.state.committedSources).toEqual(before)
    expect((await editor.redo(editor.state.revision)).status).toBe('applied')
    expect(editor.state.committedSources).toEqual(after)
    const updated = Object.values(editor.state.lastValidModel!.$data.relations)
      .find(r => r.title === 'Показывает заказы')!
    expect(
      (await editor.dispatch({
        id: 3,
        expectedRevision: editor.state.revision,
        semantic: { type: 'relation.remove', input: { id: updated.id } },
      })).status,
    ).toBe('applied')
    expect(editor.state.committedSources[0]?.content).not.toContain('web -> customer')
    expect((await editor.undo(editor.state.revision)).status).toBe('applied')
    expect(editor.state.committedSources).toEqual(after)
  }, 15_000)
})
