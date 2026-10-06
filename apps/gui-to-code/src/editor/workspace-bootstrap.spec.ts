import { LikeC4Model } from '@likec4/core/model'
import type { ElementKind } from '@likec4/core/types'
import { describe, expect, it, vi } from 'vitest'
import { compile } from '../compiler'
import type { CompilerPort, EditorDocumentPort, EditorOperation, SourceFile } from './contracts'
import { EditorDocumentError } from './contracts'
import { languageServicesDocumentPort as documents } from './language-services-adapter'
import { EditorWorkspace } from './workspace'

const sources: readonly SourceFile[] = [
  { uri: 'spec.c4', content: '// Keep specification bytes\nspecification { element service element database }\n' },
  { uri: 'model.c4', content: '// Keep model comment\nmodel {\n  // Keep empty model comment\n}\n' },
  { uri: 'views.c4', content: '// Keep views bytes\nviews {}\n' },
]

function operation(title?: string, expectedRevision = 0): EditorOperation {
  return {
    id: expectedRevision + 1,
    expectedRevision,
    semantic: {
      type: 'diagram.create',
      input: { kind: 'service' as ElementKind, ...(title !== undefined ? { title } : {}) },
    },
  }
}

function workspace(compiler: CompilerPort = compile, port: EditorDocumentPort = documents) {
  return EditorWorkspace.create(sources, compiler, port, 'default', {}, 'model.c4')
}

describe('EditorWorkspace WP-15 diagram bootstrap', () => {
  it('creates a visible custom-kind root and context view in one revision, preserving files and exact history', async () => {
    const editor = await workspace()
    const before = editor.state
    const result = await editor.dispatch(operation('  Сервис заказов  '))
    expect(result).toEqual({
      status: 'applied',
      command: 'diagram.create',
      revision: 1,
      createdElementId: 'service',
      createdViewId: 'view1',
    })
    const after = editor.state
    expect(after.lastValidModel?.$data.elements['service']).toMatchObject({ kind: 'service', title: 'Сервис заказов' })
    expect(Object.keys(after.lastValidModel?.$data.elements ?? {})).toEqual(['service'])
    expect(Object.keys(after.lastValidModel?.$data.views ?? {})).toEqual(['index', 'view1'])
    expect(after.lastValidModel?.$data.views['view1']).toMatchObject({
      _type: 'element',
      title: 'Контекст архитектуры',
    })
    const context = after.lastValidModel?.$data.views['view1']
    expect(context && 'viewOf' in context ? context.viewOf : undefined).toBeUndefined()
    expect(after.lastValidModel?.$data.views['view1']?.nodes.map(node => node.modelRef)).toEqual(['service'])
    expect(after.committedSources.filter(source => source.uri !== 'model.c4')).toEqual(
      sources.filter(source => source.uri !== 'model.c4'),
    )
    expect(after.committedSources.find(source => source.uri === 'model.c4')?.content)
      .toContain('// Keep empty model comment')
    expect(after.manualLayouts).toEqual(before.manualLayouts)
    expect(after.history.past).toHaveLength(1)
    expect(await editor.undo(1)).toMatchObject({ status: 'applied', revision: 2 })
    expect(editor.state.committedSources).toEqual(sources)
    expect(editor.state.manualLayouts).toEqual(before.manualLayouts)
    expect(Object.keys(editor.state.lastValidModel?.$data.elements ?? {})).toEqual([])
    expect(Object.keys(editor.state.lastValidModel?.$data.views ?? {})).toEqual(['index'])
    expect(await editor.redo(2)).toMatchObject({ status: 'applied', revision: 3 })
    expect(editor.state.committedSources).toEqual(after.committedSources)
    expect(editor.state.manualLayouts).toEqual(after.manualLayouts)
  })

  it('supports omitted title and an explicit target document', async () => {
    const editor = await workspace()
    expect(
      await editor.dispatch({
        id: 1,
        expectedRevision: 0,
        semantic: { type: 'diagram.create', input: { kind: 'database' as ElementKind, documentUri: 'model.c4' } },
      }),
    ).toMatchObject({ status: 'applied', createdElementId: 'database', createdViewId: 'view1' })
    expect(editor.state.lastValidModel?.$data.elements['database']?.title).toBe('database')
    expect(editor.state.lastValidModel?.$data.views['view1']?.title).toBe('Контекст архитектуры')
    expect(editor.state.committedSources.filter(source => source.uri !== 'model.c4')).toEqual(
      sources.filter(source => source.uri !== 'model.c4'),
    )
  })

  it('lets planners select the model document when the entry contains only specification and comments', async () => {
    const port = {
      ...documents,
      createElement: vi.fn<EditorDocumentPort['createElement']>(documents.createElement),
      createView: vi.fn<EditorDocumentPort['createView']>(documents.createView),
    }
    const editor = await EditorWorkspace.create(sources, compile, port, 'default', {}, 'spec.c4')
    const before = editor.state
    expect(await editor.dispatch(operation('Новый элемент'))).toMatchObject({ status: 'applied', revision: 1 })
    expect(port.createElement.mock.calls[0]?.[1]).not.toHaveProperty('documentUri')
    expect(port.createView.mock.calls[0]?.[1]).not.toHaveProperty('documentUri')
    const after = editor.state
    expect(after.entryDocumentUri).toBe('spec.c4')
    expect(after.committedSources.filter(source => source.uri !== 'model.c4')).toEqual(
      sources.filter(source => source.uri !== 'model.c4'),
    )
    expect(after.lastValidModel?.$data.views['view1']?.sourcePath).toBe('model.c4')
    expect(after.lastValidModel?.$data.views['view1']?.title).toBe('Контекст архитектуры')
    expect(after.history.past).toHaveLength(1)
    expect(await editor.undo(1)).toMatchObject({ status: 'applied', revision: 2 })
    expect(editor.state.committedSources).toEqual(sources)
    expect(editor.state.entryDocumentUri).toBe('spec.c4')
    expect(editor.state.manualLayouts).toEqual(before.manualLayouts)
    expect(await editor.redo(2)).toMatchObject({ status: 'applied', revision: 3 })
    expect(editor.state.committedSources).toEqual(after.committedSources)
    expect(editor.state.entryDocumentUri).toBe('spec.c4')
    expect(editor.state.manualLayouts).toEqual(after.manualLayouts)
  })

  it.each(['spec.c4', 'missing.c4'])(
    'fails closed for explicit target %s without selecting another document',
    async documentUri => {
      const port = { ...documents, createView: vi.fn<EditorDocumentPort['createView']>(documents.createView) }
      const editor = await EditorWorkspace.create(sources, compile, port, 'default', {}, 'spec.c4')
      const before = editor.state
      expect(
        await editor.dispatch({
          id: 1,
          expectedRevision: 0,
          semantic: { type: 'diagram.create', input: { kind: 'service' as ElementKind, documentUri } },
        }),
      ).toMatchObject({
        status: 'rejected',
        issues: [{
          code: 'source-edit-failed',
          message: 'Целевой документ недоступен или не содержит раздел model. Выберите документ с моделью.',
        }],
      })
      expect(editor.state).toBe(before)
      expect(port.createView).not.toHaveBeenCalled()
    },
  )

  it('rejects a view title that differs from the compiler default when title is omitted', async () => {
    const editor = await workspace(compile, {
      ...documents,
      createView: (current, input) => documents.createView(current, { ...input, title: 'Different' }),
    })
    const before = editor.state
    expect(await editor.dispatch(operation())).toMatchObject({
      status: 'rejected',
      issues: [{ code: 'created-view-not-found' }],
    })
    expect(editor.state).toBe(before)
  })

  it.each(['bad-kind', 'empty-title', 'stale-revision'] as const)('rejects %s without any mutation', async invalid => {
    const port = { ...documents, createElement: vi.fn<EditorDocumentPort['createElement']>(documents.createElement) }
    const editor = await workspace(compile, port)
    const before = editor.state
    const request = invalid === 'bad-kind'
      ? {
        id: 1,
        expectedRevision: 0,
        semantic: { type: 'diagram.create' as const, input: { kind: 'missing' as ElementKind } },
      }
      : operation(invalid === 'empty-title' ? '  ' : undefined, invalid === 'stale-revision' ? 1 : 0)
    expect((await editor.dispatch(request)).status).toBe(invalid === 'stale-revision' ? 'conflict' : 'rejected')
    expect(editor.state).toBe(before)
    expect(port.createElement).not.toHaveBeenCalled()
  })

  it.each(['elements', 'views', 'index'] as const)('rejects a project with existing %s', async existing => {
    const content = existing === 'elements'
      ? 'model { existing = service }'
      : `views { view ${existing === 'index' ? 'index' : 'existing'} { include * } }`
    const editor = await EditorWorkspace.create([...sources, { uri: 'existing.c4', content }], compile)
    expect(editor.state.compilation.status).toBe('valid')
    const before = editor.state
    expect(await editor.dispatch(operation())).toMatchObject({
      status: 'rejected',
      issues: [{ code: 'bootstrap-project-not-empty' }],
    })
    expect(editor.state).toBe(before)
  })

  it('rolls back exactly when the second planner fails, even if it mutates its isolated input', async () => {
    const editor = await workspace(compile, {
      ...documents,
      async createView(candidate) {
        Object.assign(candidate[0]!, { content: 'invalid' })
        throw new EditorDocumentError('invalid-operation', 'Injected second planner failure')
      },
    })
    const before = editor.state
    expect((await editor.dispatch(operation())).status).toBe('rejected')
    expect(editor.state).toBe(before)
    expect(editor.state.committedSources).toEqual(sources)
  })

  it.each(['invalid', 'throw', 'wrong-revision'] as const)('rolls back a %s final compilation', async failure => {
    const compiler: CompilerPort = async request => {
      if (request.revision === 0) return compile(request)
      if (failure === 'throw') throw new Error('Injected compile failure')
      return { revision: failure === 'wrong-revision' ? 99 : request.revision, diagnostics: [], model: null }
    }
    const editor = await workspace(compiler)
    const before = editor.state
    expect((await editor.dispatch(operation())).status).toBe('rejected')
    expect(editor.state).toBe(before)
  })

  it.each(
    [
      'wrong-kind',
      'wrong-title',
      'wrong-view-title',
      'extra-root',
      'extra-view',
      'neighbor-change',
      'invisible-root',
    ] as const,
  )(
    'rejects a compiled candidate with %s',
    async corruption => {
      const port: EditorDocumentPort = {
        ...documents,
        async createElement(current, input) {
          const candidate = await documents.createElement(current, {
            ...input,
            ...(corruption === 'wrong-kind' ? { kind: 'database' as ElementKind } : {}),
            ...(corruption === 'wrong-title' ? { title: 'Другое название' } : {}),
          })
          if (corruption === 'extra-root') {
            return documents.createElement(candidate, { id: 'extra', kind: 'database' as ElementKind })
          }
          if (corruption === 'neighbor-change') {
            return candidate.map(source =>
              source.uri === 'spec.c4'
                ? {
                  ...source,
                  content: source.content.replace('element database', 'element database element intruder'),
                }
                : source
            )
          }
          return candidate
        },
        async createView(current, input) {
          const candidate = await documents.createView(current, {
            ...input,
            ...(corruption === 'wrong-view-title' ? { title: 'Different' } : {}),
          })
          if (corruption === 'extra-view') {
            return documents.createView(candidate, { ...input, id: 'extra' })
          }
          return candidate
        },
      }
      const compiler: CompilerPort = async request => {
        const result = await compile(request)
        const view = result.model?.$data.views['view1']
        if (corruption !== 'invisible-root' || !result.model || !view) return result
        return {
          ...result,
          model: LikeC4Model.create({
            ...result.model.$data,
            views: { ...result.model.$data.views, view1: { ...view, nodes: [], edges: [] } },
          }),
        }
      }
      const editor = await workspace(compiler, port)
      const before = editor.state
      expect((await editor.dispatch(operation('Сервис'))).status).toBe('rejected')
      expect(editor.state).toBe(before)
    },
  )

  it('ignores final compile completion after a newer draft is accepted', async () => {
    let release!: () => void
    let started!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const entered = new Promise<void>(resolve => {
      started = resolve
    })
    let calls = 0
    const compiler: CompilerPort = async request => {
      calls += 1
      if (calls === 2) {
        started()
        await gate
      }
      return compile(request)
    }
    const editor = await workspace(compiler)
    const pending = editor.dispatch(operation())
    await entered
    await editor.updateDraft(sources.map(source => ({ ...source, content: `${source.content}// New revision\n` })))
    const newer = editor.state
    release()
    expect(await pending).toEqual({ status: 'conflict', revision: 1 })
    expect(editor.state).toBe(newer)
    expect(editor.state.history.past).toHaveLength(1)
    expect(Object.keys(editor.state.lastValidModel?.$data.elements ?? {})).toEqual([])
  })
})
