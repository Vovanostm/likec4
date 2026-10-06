import type { ElementKind } from '@likec4/core/types'
import { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { elementColorOptions } from './ui/element-settings'
import { EditorWorkspace } from './workspace'

describe('context settings through the canonical workspace', () => {
  it('preserves multiple files, children, relation identity and exact history for combined settings', async () => {
    const sources = [
      {
        uri: 'spec.c4',
        content: 'specification { element component element database tag backend color brand #ff00aa }\n',
      },
      {
        uri: 'model.c4',
        content:
          '// Keep\nmodel { api = component \'API\' { component child \'Child\' }\n component other\n api -> other \'Calls\' }\n',
      },
      { uri: 'views.c4', content: 'views { view index { include * } }\n' },
    ]
    const editor = await EditorWorkspace.create(sources, compile)
    const before = editor.state
    const colors = elementColorOptions(before.lastValidModel?.$data.specification.customColors ?? {})
    const brand = colors.find(option => option.color === 'brand')
    if (!brand) throw new Error('Expected custom color')
    const result = await editor.dispatch({
      id: 1,
      expectedRevision: before.revision,
      semantic: {
        type: 'element.patch',
        input: {
          id: Fqn('api'),
          patch: {
            kind: 'database' as ElementKind,
            shape: 'cylinder',
            color: brand.color,
            tags: ['backend'],
            technology: 'PostgreSQL',
            icon: 'tech:postgresql',
          },
        },
      },
    })
    expect(result.status).toBe('applied')
    const after = editor.state
    expect(after.lastValidModel?.$data.elements['api']).toMatchObject({
      kind: 'database',
      title: 'API',
      tags: ['backend'],
      technology: 'PostgreSQL',
      style: { shape: 'cylinder', color: 'brand', icon: 'tech:postgresql' },
    })
    expect(after.lastValidModel?.$data.elements['api.child']).toEqual(
      before.lastValidModel?.$data.elements['api.child'],
    )
    expect(after.lastValidModel?.$data.relations).toEqual(before.lastValidModel?.$data.relations)
    expect(after.committedSources[0]).toEqual(sources[0])
    expect(after.committedSources[2]).toEqual(sources[2])
    expect(after.manualLayouts).toEqual(before.manualLayouts)
    expect(after.history.past).toHaveLength(1)
    await editor.undo(after.revision)
    expect(editor.state.committedSources).toEqual(sources)
    await editor.redo(editor.state.revision)
    expect(editor.state.committedSources).toEqual(after.committedSources)
    expect(editor.state.lastValidModel?.$data.elements['api']).toEqual(after.lastValidModel?.$data.elements['api'])
  }, 15_000)

  it('rejects invalid kind and stale settings without changing committed state', async () => {
    const editor = await EditorWorkspace.create([
      {
        uri: 'model.c4',
        content: 'specification { element component } model { api = component } views { view index { include * } }',
      },
    ], compile)
    const before = editor.state
    expect(
      (await editor.dispatch({
        id: 1,
        expectedRevision: before.revision,
        semantic: {
          type: 'element.patch',
          input: { id: Fqn('api'), patch: { kind: 'missing' as ElementKind } },
        },
      })).status,
    ).toBe('rejected')
    expect(editor.state.committedSources).toEqual(before.committedSources)
    expect(editor.state.history).toEqual(before.history)
    expect(
      (await editor.dispatch({
        id: 2,
        expectedRevision: before.revision + 1,
        semantic: {
          type: 'element.patch',
          input: { id: Fqn('api'), patch: { color: 'red' } },
        },
      })).status,
    ).toBe('conflict')
    expect(editor.state.committedSources).toEqual(before.committedSources)
  })
})
