import type { LikeC4Model } from '@likec4/core/model'
import type { ElementKind, Fqn } from '@likec4/core/types'
import { expect, it } from 'vitest'
import type { CompilerPort, EditorDocumentPort, SourceFile } from './contracts'
import { EditorDocumentError } from './contracts'
import { EditorWorkspace } from './workspace'

const sources = [{
  uri: 'model.c4',
  content: 'system shop\ncomponent shop.web\n',
}]

function modelFor(source: string): LikeC4Model.Layouted {
  const elements = Object.fromEntries(source.trim().split('\n').map(line => {
    const [kind, id] = line.split(' ') as [ElementKind, Fqn]
    return [id, { id, kind, title: id }]
  }))
  return {
    $data: {
      specification: { elements: { system: {}, component: {} }, tags: {} },
      elements,
      relations: {},
      views: {},
    },
  } as unknown as LikeC4Model.Layouted
}

const compiler: CompilerPort = async request => ({
  revision: request.revision,
  diagnostics: [],
  model: modelFor(request.sources[0]?.content ?? ''),
})

function unsupported(): never {
  throw new EditorDocumentError('invalid-operation', 'unused in this test')
}

const documents: EditorDocumentPort = {
  async createElement() {
    return unsupported()
  },
  async createRelation() {
    return unsupported()
  },
  async patchElement() {
    return unsupported()
  },
  async moveElement() {
    return unsupported()
  },
  async renameElement(current: readonly SourceFile[]) {
    return current.map(file => ({
      ...file,
      content: file.content
        .replace('system shop', 'system store')
        .replace('component shop.web', 'system store.web'),
    }))
  },
  async inspectRemoveElement() {
    return unsupported()
  },
  async removeElement() {
    return unsupported()
  },
}

it('rejects a subtree rewrite when a descendant changes kind', async () => {
  const workspace = await EditorWorkspace.create(sources, compiler, documents)
  const before = workspace.state

  const result = await workspace.dispatch({
    id: 1,
    expectedRevision: 0,
    semantic: {
      type: 'element.rename',
      input: { id: 'shop' as Fqn, newId: 'store' },
    },
  })

  expect(result).toMatchObject({
    status: 'rejected',
    issues: [{ code: 'rename-verification-failed' }],
  })
  expect(workspace.state).toBe(before)
})
