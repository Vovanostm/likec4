import type { LikeC4Model } from '@likec4/core/model'
import type { ElementKind, Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import type { CompilerPort, EditorDocumentPort, SourceFile } from './contracts'
import { EditorWorkspace } from './workspace'

const serviceKind = 'service' as ElementKind
const source: readonly SourceFile[] = [{ uri: 'model.c4', content: 'service api|title=API\n' }]

function modelFor(content: string): LikeC4Model.Layouted {
  const hasWorker = content.includes('service worker|title=Worker')
  return {
    $data: {
      specification: {
        elements: { service: {} },
        tags: {},
      },
      elements: {
        api: { id: 'api' as Fqn, kind: serviceKind, title: 'API', tags: [] },
        ...(hasWorker
          ? { worker: { id: 'worker' as Fqn, kind: serviceKind, title: 'Worker', tags: [] } }
          : {}),
      },
      relations: {},
      views: {},
      deployments: { elements: {}, relations: {} },
    },
  } as unknown as LikeC4Model.Layouted
}

const compiler: CompilerPort = async request => ({
  revision: request.revision,
  diagnostics: [],
  model: modelFor(request.sources[0]?.content ?? ''),
})

const documents = {
  async createElement(sources: readonly SourceFile[], input: { readonly kind: ElementKind; readonly id: string; readonly title?: string }) {
    return sources.map(item => ({
      ...item,
      content: `${item.content}${input.kind} ${input.id}|title=${input.title ?? input.id}\n`,
    }))
  },
} as unknown as EditorDocumentPort

describe('EditorWorkspace specification-defined kinds', () => {
  it('creates a custom kind declared by the compiled specification', async () => {
    const workspace = await EditorWorkspace.create(source, compiler, documents)

    const result = await workspace.dispatch({
      id: 1,
      expectedRevision: 0,
      semantic: {
        type: 'element.create',
        input: { kind: serviceKind, id: 'worker', title: 'Worker' },
      },
    })

    expect(result).toEqual({
      status: 'applied',
      command: 'element.create',
      revision: 1,
      createdElementId: 'worker',
    })
    expect(workspace.state.lastValidModel?.$data.elements.worker).toMatchObject({
      kind: serviceKind,
      title: 'Worker',
    })
  })

  it('rejects a kind absent from the compiled specification', async () => {
    const workspace = await EditorWorkspace.create(source, compiler, documents)

    const result = await workspace.dispatch({
      id: 2,
      expectedRevision: 0,
      semantic: {
        type: 'element.create',
        input: { kind: 'component' as ElementKind, id: 'worker' },
      },
    })

    expect(result).toMatchObject({
      status: 'rejected',
      revision: 0,
      issues: [{ code: 'kind-unavailable' }],
    })
    expect(workspace.state.revision).toBe(0)
  })
})
