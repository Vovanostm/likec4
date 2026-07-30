import type { LikeC4Model } from '@likec4/core/model'
import type { ElementKind, Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import type {
  CompilerPort,
  EditorDocumentPort,
  EditorOperation,
  RemovalDependencyReport,
  SourceFile,
} from './contracts'
import { EditorDocumentError } from './contracts'
import { EditorWorkspace } from './workspace'

const initialSource = `actor customer|title=Customer
system shop|title=Online shop
component shop.web|title=Web application|desc=Frontend|tech=TypeScript|tags=ui
component shop.api|title=API
system platform|title=Platform
relation customer->shop.web
`
const sources = [{ uri: 'model.c4', content: initialSource }]

interface ParsedLine {
  readonly kind: ElementKind
  readonly id: Fqn
  readonly title: string
  readonly description?: string
  readonly technology?: string
  readonly tags: readonly string[]
}

function parseElements(source: string): ParsedLine[] {
  return source.split('\n').flatMap(line => {
    const match = /^(actor|system|component) ([A-Za-z_][\w.-]*)(.*)$/.exec(line)
    if (!match) return []
    const properties = Object.fromEntries(match[3]!.split('|').filter(Boolean).map(part => {
      const [key, ...value] = part.split('=')
      return [key, value.join('=')]
    }))
    return [{
      kind: match[1] as ElementKind,
      id: match[2] as Fqn,
      title: properties.title ?? match[2]!,
      ...(properties.desc ? { description: properties.desc } : {}),
      ...(properties.tech ? { technology: properties.tech } : {}),
      tags: properties.tags?.split(',').filter(Boolean) ?? [],
    }]
  })
}

function modelFor(source: string): LikeC4Model.Layouted {
  const elements = Object.fromEntries(parseElements(source).map(element => [element.id, {
    id: element.id,
    kind: element.kind,
    title: element.title,
    description: element.description,
    technology: element.technology,
    tags: element.tags,
  }]))
  const relations = Object.fromEntries(source.split('\n').flatMap((line, index) => {
    const match = /^relation ([\w.-]+)->([\w.-]+)$/.exec(line)
    return match
      ? [[`relation-${index}`, {
        id: `relation-${index}`,
        source: { model: match[1] },
        target: { model: match[2] },
      }]]
      : []
  }))
  return {
    $data: {
      specification: {
        elements: { actor: {}, system: {}, component: {} },
        tags: { ui: {}, backend: {} },
      },
      elements,
      relations,
      views: {},
    },
  } as unknown as LikeC4Model.Layouted
}

const compiler: CompilerPort = async request => {
  const source = request.sources[0]?.content ?? ''
  if (source === 'invalid') {
    return { revision: request.revision, diagnostics: [{ message: 'invalid' }], model: null }
  }
  return { revision: request.revision, diagnostics: [], model: modelFor(source) }
}

function replaceSource(current: readonly SourceFile[], transform: (source: string) => string): readonly SourceFile[] {
  return current.map(source => ({ ...source, content: transform(source.content) }))
}

function remapSource(source: string, oldRoot: Fqn, newRoot: Fqn): string {
  const map = (value: string): string => value === oldRoot || value.startsWith(`${oldRoot}.`)
    ? `${newRoot}${value.slice(oldRoot.length)}`
    : value
  return source.split('\n').map(line => {
    const element = /^(actor|system|component) ([\w.-]+)(.*)$/.exec(line)
    if (element) return `${element[1]} ${map(element[2]!)}${element[3]}`
    const relation = /^relation ([\w.-]+)->([\w.-]+)$/.exec(line)
    if (relation) return `relation ${map(relation[1]!)}->${map(relation[2]!)}`
    return line
  }).join('\n')
}

function reportFor(id: Fqn): RemovalDependencyReport {
  return {
    target: id,
    revision: `dependencies:${id}`,
    dependencies: [{
      id: `relation:${id}`,
      kind: 'incoming-relation',
      uri: 'model.c4',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      removal: 'separate',
    }],
  }
}

const documents: EditorDocumentPort = {
  async createElement(current, input) {
    return replaceSource(current, source => `${source}${input.kind} ${input.id}|title=${input.title ?? input.id}\n`)
  },
  async createRelation(current, input) {
    return replaceSource(current, source => `${source}relation ${input.sourceId}->${input.targetId}\n`)
  },
  async patchElement(current, input) {
    return replaceSource(current, source => source.split('\n').map(line => {
      const parsed = /^(actor|system|component) ([\w.-]+)(.*)$/.exec(line)
      if (!parsed || parsed[2] !== input.id) return line
      const currentElement = parseElements(`${line}\n`)[0]!
      const patch = input.patch
      const title = patch.title ?? currentElement.title
      const description = patch.description === undefined ? currentElement.description : patch.description ?? undefined
      const technology = patch.technology === undefined ? currentElement.technology : patch.technology ?? undefined
      const tags = patch.tags === undefined ? currentElement.tags : [...new Set(patch.tags)].sort()
      return `${parsed[1]} ${input.id}|title=${title}`
        + `${description ? `|desc=${description}` : ''}`
        + `${technology ? `|tech=${technology}` : ''}`
        + `${tags.length ? `|tags=${tags.join(',')}` : ''}`
    }).join('\n'))
  },
  async moveElement(current, input) {
    const next = (input.parentId ? `${input.parentId}.${input.id.slice(input.id.lastIndexOf('.') + 1)}` : input.id.slice(input.id.lastIndexOf('.') + 1)) as Fqn
    return replaceSource(current, source => remapSource(source, input.id, next))
  },
  async renameElement(current, input) {
    const index = input.id.lastIndexOf('.')
    const next = `${index < 0 ? '' : `${input.id.slice(0, index)}.`}${input.newId}` as Fqn
    return replaceSource(current, source => remapSource(source, input.id, next))
  },
  async inspectRemoveElement(_current, id) {
    return reportFor(id)
  },
  async removeElement(current, input) {
    const report = reportFor(input.id)
    if (input.dependencyRevision !== report.revision) throw new EditorDocumentError('stale-document', 'stale')
    if (input.approvedDependencyIds.join() !== report.dependencies.map(item => item.id).join()) {
      throw new EditorDocumentError('dependencies-not-approved', 'approval mismatch')
    }
    return replaceSource(current, source => source.split('\n').filter(line => {
      const element = /^(actor|system|component) ([\w.-]+)/.exec(line)
      if (element && (element[2] === input.id || element[2]!.startsWith(`${input.id}.`))) return false
      const relation = /^relation ([\w.-]+)->([\w.-]+)$/.exec(line)
      return !relation || ![relation[1], relation[2]].some(id => id === input.id || id!.startsWith(`${input.id}.`))
    }).join('\n'))
  },
}

function operation(semantic: EditorOperation['semantic'], expectedRevision = 0): EditorOperation {
  return { id: Date.now(), expectedRevision, semantic }
}

function createWorkspace(customCompiler: CompilerPort = compiler, customDocuments: EditorDocumentPort = documents) {
  return EditorWorkspace.create(sources, customCompiler, customDocuments)
}

describe('EditorWorkspace WP-04', () => {
  it('patches requested fields in one atomic history entry', async () => {
    const workspace = await createWorkspace()
    const result = await workspace.dispatch(operation({
      type: 'element.patch',
      input: {
        id: 'shop.web' as Fqn,
        patch: { title: 'Storefront', description: null, technology: 'React', tags: ['backend', 'ui', 'ui'] },
      },
    }))

    expect(result).toEqual({ status: 'applied', command: 'element.patch', revision: 1, updatedElementId: 'shop.web' })
    expect(workspace.state.history.past).toHaveLength(1)
    expect(workspace.state.lastValidModel?.$data.elements['shop.web']).toMatchObject({
      title: 'Storefront',
      technology: 'React',
      tags: ['backend', 'ui'],
    })
  })

  it('moves a complete subtree and returns the new FQN', async () => {
    const workspace = await createWorkspace()
    const result = await workspace.dispatch(operation({
      type: 'element.move',
      input: { id: 'shop' as Fqn, parentId: 'platform' as Fqn },
    }))

    expect(result).toEqual({ status: 'applied', command: 'element.move', revision: 1, updatedElementId: 'platform.shop' })
    expect(workspace.state.lastValidModel?.$data.elements['platform.shop.web']).toBeDefined()
    expect(workspace.state.lastValidModel?.$data.elements.shop).toBeUndefined()
  })

  it('renames a parent and preserves descendants', async () => {
    const workspace = await createWorkspace()
    const result = await workspace.dispatch(operation({
      type: 'element.rename',
      input: { id: 'shop' as Fqn, newId: 'store' },
    }))

    expect(result).toEqual({ status: 'applied', command: 'element.rename', revision: 1, updatedElementId: 'store' })
    expect(workspace.state.lastValidModel?.$data.elements['store.api']).toBeDefined()
    expect(workspace.state.committedSources[0]?.content).toContain('relation customer->store.web')
  })

  it('inspects then removes with exact revision-bound approval', async () => {
    const workspace = await createWorkspace()
    const inspection = await workspace.inspectElementRemoval('shop.web' as Fqn, 0)
    expect(inspection).toMatchObject({ status: 'ready', report: { target: 'shop.web' } })
    if (inspection.status !== 'ready') throw new Error('expected ready report')

    const result = await workspace.dispatch(operation({
      type: 'element.remove',
      input: {
        id: 'shop.web' as Fqn,
        dependencyRevision: inspection.report.revision,
        approvedDependencyIds: inspection.report.dependencies.map(item => item.id),
      },
    }))

    expect(result).toEqual({ status: 'applied', command: 'element.remove', revision: 1, removedElementId: 'shop.web' })
    expect(workspace.state.lastValidModel?.$data.elements['shop.web']).toBeUndefined()
    expect(workspace.state.history.past).toHaveLength(1)
  })

  it('rejects stale removal approval without mutation', async () => {
    const workspace = await createWorkspace()
    const before = workspace.state
    const result = await workspace.dispatch(operation({
      type: 'element.remove',
      input: { id: 'shop.web' as Fqn, dependencyRevision: 'stale', approvedDependencyIds: [] },
    }))

    expect(result).toMatchObject({ status: 'rejected', issues: [{ code: 'removal-report-stale' }] })
    expect(workspace.state).toBe(before)
  })

  it('undoes and redoes byte-exact sources', async () => {
    const workspace = await createWorkspace()
    const original = workspace.state.committedSources[0]?.content
    await workspace.dispatch(operation({ type: 'element.rename', input: { id: 'shop' as Fqn, newId: 'store' } }))
    const changed = workspace.state.committedSources[0]?.content

    expect(await workspace.undo(1)).toEqual({ status: 'applied', command: 'history.undo', revision: 2 })
    expect(workspace.state.committedSources[0]?.content).toBe(original)
    expect(await workspace.redo(2)).toEqual({ status: 'applied', command: 'history.redo', revision: 3 })
    expect(workspace.state.committedSources[0]?.content).toBe(changed)
  })

  it('clears future after a new semantic command', async () => {
    const workspace = await createWorkspace()
    await workspace.dispatch(operation({ type: 'element.rename', input: { id: 'shop' as Fqn, newId: 'store' } }))
    await workspace.undo(1)
    expect(workspace.state.history.future).toHaveLength(1)

    await workspace.dispatch(operation({
      type: 'element.patch',
      input: { id: 'shop.web' as Fqn, patch: { title: 'New title' } },
    }, 2))
    expect(workspace.state.history.future).toEqual([])
    expect(await workspace.redo(3)).toMatchObject({ status: 'rejected', issues: [{ code: 'redo-history-empty' }] })
  })

  it('serializes same-revision dispatch and redo', async () => {
    const workspace = await createWorkspace()
    await workspace.dispatch(operation({ type: 'element.rename', input: { id: 'shop' as Fqn, newId: 'store' } }))
    await workspace.undo(1)

    const [patched, redone] = await Promise.all([
      workspace.dispatch(operation({
        type: 'element.patch',
        input: { id: 'shop.web' as Fqn, patch: { title: 'Patched' } },
      }, 2)),
      workspace.redo(2),
    ])

    expect(patched.status).toBe('applied')
    expect(redone).toEqual({ status: 'conflict', revision: 3 })
  })

  it('rejects invalid visible draft for commands and redo', async () => {
    const workspace = await createWorkspace()
    await workspace.dispatch(operation({ type: 'element.rename', input: { id: 'shop' as Fqn, newId: 'store' } }))
    await workspace.undo(1)
    await workspace.updateDraft([{ uri: 'model.c4', content: 'invalid' }])
    const before = workspace.state

    expect(await workspace.redo(2)).toMatchObject({ status: 'rejected', issues: [{ code: 'workspace-invalid' }] })
    expect(workspace.state).toBe(before)
  })

  it('keeps state identity when source editing fails', async () => {
    const failing = { ...documents, patchElement: async () => {
      throw new EditorDocumentError('invalid-title', 'invalid')
    } }
    const workspace = await createWorkspace(compiler, failing)
    const before = workspace.state

    const result = await workspace.dispatch(operation({
      type: 'element.patch',
      input: { id: 'shop.web' as Fqn, patch: { title: 'Allowed by preflight' } },
    }))

    expect(result).toMatchObject({ status: 'rejected', issues: [{ code: 'invalid-title' }] })
    expect(workspace.state).toBe(before)
  })
})
