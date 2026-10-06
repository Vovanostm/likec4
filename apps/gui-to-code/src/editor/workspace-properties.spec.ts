import { flattenMarkdownOrString, Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { patchFromForm } from './ui/element-form'
import { EditorWorkspace } from './workspace'

describe('source-preserving inspector properties with the real compiler', () => {
  it.each(['\'Обрабатывает заказы\'', '\'\'\'**Обрабатывает** заказы\'\'\''])(
    'preserves untouched description %s and supports description changes and history',
    async description => {
      const sources = [
        { uri: 'spec.c4', content: '// Preserve this entire file\nspecification { element component }\n' },
        {
          uri: 'model.c4',
          content: `model {
  api = component 'API' {
    // Preserve description formatting and this comment
    description ${description}
    technology 'Node.js'
  }
}
views { view index { include * } }
`,
        },
      ]
      const editor = await EditorWorkspace.create(sources, compile)
      expect(editor.state.compilation.status).toBe('valid')
      const element = editor.state.lastValidModel?.$data.elements['api']
      if (!element) throw new Error('Expected fixture element')
      const base = {
        title: element.title,
        description: flattenMarkdownOrString(element.description) ?? '',
        technology: element.technology ?? '',
        tags: element.tags ?? [],
      }
      const titlePatch = patchFromForm({ ...base, title: 'API заказов' }, base)
      expect(titlePatch).toEqual({ title: 'API заказов' })
      const renamed = await editor.dispatch({
        id: 1,
        expectedRevision: editor.state.revision,
        semantic: { type: 'element.patch', input: { id: Fqn('api'), patch: titlePatch } },
      })
      expect(renamed.status).toBe('applied')
      const afterTitle = editor.state.committedSources
      expect(afterTitle[0]).toEqual(sources[0])
      expect(afterTitle[1]?.content).toContain(`description ${description}`)
      expect(afterTitle[1]?.content).toContain('// Preserve description formatting and this comment')
      expect(flattenMarkdownOrString(editor.state.lastValidModel?.$data.elements['api']?.description))
        .toBe(base.description)

      const changed = await editor.dispatch({
        id: 2,
        expectedRevision: editor.state.revision,
        semantic: {
          type: 'element.patch',
          input: { id: Fqn('api'), patch: { description: 'Принимает новые заказы' } },
        },
      })
      expect(changed.status).toBe('applied')
      const afterDescription = editor.state.committedSources
      expect(flattenMarkdownOrString(editor.state.lastValidModel?.$data.elements['api']?.description))
        .toBe('Принимает новые заказы')
      expect(editor.state.lastValidModel?.$data.elements['api']?.technology).toBe('Node.js')
      expect(afterDescription[0]).toEqual(sources[0])
      expect(afterDescription[1]?.content).toContain(
        '// Preserve description formatting and this comment\n    description ',
      )
      await editor.undo(editor.state.revision)
      expect(editor.state.committedSources).toEqual(afterTitle)
      await editor.undo(editor.state.revision)
      expect(editor.state.committedSources).toEqual(sources)
      await editor.redo(editor.state.revision)
      await editor.redo(editor.state.revision)
      expect(editor.state.committedSources).toEqual(afterDescription)

      const cleared = await editor.dispatch({
        id: 3,
        expectedRevision: editor.state.revision,
        semantic: { type: 'element.patch', input: { id: Fqn('api'), patch: { description: null } } },
      })
      expect(cleared.status).toBe('applied')
      expect(flattenMarkdownOrString(editor.state.lastValidModel?.$data.elements['api']?.description)).toBeNull()
      await editor.undo(editor.state.revision)
      expect(editor.state.committedSources).toEqual(afterDescription)
    },
    15_000,
  )
})
