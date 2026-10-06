import { flattenMarkdownOrString } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { EditorWorkspace } from './workspace'

const sources = [
  { uri: 'spec.c4', content: '// Preserve specification\nspecification { element system }\n' },
  {
    uri: 'model.c4',
    content: `// Preserve model
model {
  a = system
  b = system
  a -> b 'Request' { // Preserve comment
    technology 'HTTP'
  }
  a -> b 'Other'
}
views { view index { include * } }
`,
  },
]

describe('tag declarations and logical relationship metadata', () => {
  it('compiles declarations/assignment/metadata as atomic history and restores exact source on reload', async () => {
    const editor = await EditorWorkspace.create(sources, compile)
    const before = editor.state.committedSources
    const create = await editor.dispatch({
      id: 1,
      expectedRevision: editor.state.revision,
      semantic: { type: 'tag.create', input: { name: 'backend' } },
    })
    expect(create).toMatchObject({ status: 'applied', createdTag: 'backend' })
    expect(editor.state.history.past).toHaveLength(1)
    expect(editor.state.committedSources.find(file => file.uri === 'model.c4')).toEqual(sources[1])
    const afterTag = editor.state.committedSources
    const relation = Object.values(editor.state.lastValidModel!.$data.relations).find(r => r.title === 'Request')!
    const patch = await editor.dispatch({
      id: 2,
      expectedRevision: editor.state.revision,
      semantic: {
        type: 'relation.patch',
        input: { id: relation.id, patch: { description: 'Sends orders', technology: 'HTTPS', tags: ['backend'] } },
      },
    })
    expect(patch.status).toBe('applied')
    const after = editor.state.committedSources
    const updated = Object.values(editor.state.lastValidModel!.$data.relations).find(r => r.title === 'Request')!
    expect(updated).toMatchObject({ technology: 'HTTPS', tags: ['backend'] })
    expect(flattenMarkdownOrString(updated.description)).toBe('Sends orders')
    expect(after.find(file => file.uri === 'model.c4')?.content).toContain('// Preserve comment')
    expect(after.find(file => file.uri === 'model.c4')?.content).toContain('a -> b \'Other\'')
    expect(editor.state.history.past).toHaveLength(2)
    await editor.undo(editor.state.revision)
    expect(editor.state.committedSources).toEqual(afterTag)
    await editor.undo(editor.state.revision)
    expect(editor.state.committedSources).toEqual(before)
    await editor.redo(editor.state.revision)
    await editor.redo(editor.state.revision)
    expect(editor.state.committedSources).toEqual(after)
    const reloaded = await EditorWorkspace.create(after, compile)
    expect(reloaded.state.compilation.status).toBe('valid')
    expect(reloaded.state.lastValidModel!.$data.specification.tags).toHaveProperty('backend')
    expect(Object.values(reloaded.state.lastValidModel!.$data.relations).find(r => r.title === 'Request'))
      .toMatchObject({ technology: 'HTTPS', tags: ['backend'] })
    const clear = await reloaded.dispatch({
      id: 3,
      expectedRevision: reloaded.state.revision,
      semantic: {
        type: 'relation.patch',
        input: { id: updated.id, patch: { technology: null, description: null, tags: [] } },
      },
    })
    expect(clear.status).toBe('applied')
    const cleared = Object.values(reloaded.state.lastValidModel!.$data.relations).find(r => r.title === 'Request')!
    expect(cleared.technology ?? '').toBe('')
    expect(flattenMarkdownOrString(cleared.description) ?? '').toBe('')
    expect(cleared.tags ?? []).toEqual([])
  }, 15_000)

  it('rejects malformed/duplicate tags, unknown assignment and stale operations without history', async () => {
    const editor = await EditorWorkspace.create(sources, compile)
    const dispatchTag = (name: string) =>
      editor.dispatch({
        id: 1,
        expectedRevision: editor.state.revision,
        semantic: { type: 'tag.create', input: { name } },
      })
    expect((await dispatchTag('bad name')).status).toBe('rejected')
    expect((await dispatchTag('backend')).status).toBe('applied')
    const state = editor.state
    expect((await dispatchTag('backend')).status).toBe('rejected')
    const relation = Object.values(state.lastValidModel!.$data.relations)[0]!
    expect(
      (await editor.dispatch({
        id: 2,
        expectedRevision: state.revision,
        semantic: { type: 'relation.patch', input: { id: relation.id, patch: { tags: ['missing'] } } },
      })).status,
    )
      .toBe('rejected')
    expect(
      (await editor.dispatch({
        id: 3,
        expectedRevision: state.revision - 1,
        semantic: { type: 'tag.create', input: { name: 'stale' } },
      })).status,
    ).toBe('conflict')
    expect(editor.state).toBe(state)
  }, 15_000)
})
