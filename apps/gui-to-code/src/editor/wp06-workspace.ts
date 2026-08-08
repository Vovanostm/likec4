import type { Fqn, RelationId, ViewId, ViewManualLayoutSnapshot } from '@likec4/core/types'
import type {
  CommandIssue,
  CommandResult,
  CompileResult,
  EditorCommand,
  EditorDocumentPort,
  EditorWorkspaceState,
  SourceFile,
} from './contracts'
import { EditorDocumentError } from './contracts'

type Wp06Command = Extract<EditorCommand, {
  type:
    | 'dynamicView.create'
    | 'dynamicStep.create'
    | 'dynamicStep.patch'
    | 'dynamicStep.remove'
    | 'deploymentView.create'
    | 'deploymentElement.create'
    | 'deploymentRelation.create'
    | 'deploymentRelation.patch'
    | 'deploymentRelation.remove'
}>

type ManualLayouts = Readonly<Record<ViewId, ViewManualLayoutSnapshot>>
type SemanticEdge = {
  readonly source: unknown
  readonly target: unknown
  readonly id?: string
  readonly label?: string | null
  readonly astPath?: string
}
type DeploymentRelation = {
  readonly source: unknown
  readonly target: unknown
  readonly title?: string | null
}

export interface Wp06WorkspaceHost {
  readonly state: EditorWorkspaceState
  readonly command: Wp06Command
  readonly documents: EditorDocumentPort
  readonly compileCandidate: (revision: number, sources: readonly SourceFile[]) => Promise<CompileResult>
  readonly commitCandidate: (
    revision: number,
    sources: readonly SourceFile[],
    model: NonNullable<CompileResult['model']>,
    layouts: ManualLayouts,
  ) => void
  readonly isCurrent: () => boolean
  readonly currentRevision: () => number
}

function issue(code: CommandIssue['code'], message: string): CommandIssue {
  return { code, message }
}

function rejected(state: EditorWorkspaceState, code: CommandIssue['code'], message: string): CommandResult {
  return { status: 'rejected', revision: state.revision, issues: [issue(code, message)] }
}

function sourceIssue(command: Wp06Command, error: unknown): CommandIssue {
  const code = error instanceof EditorDocumentError ? error.code : 'unknown'
  if (code === 'collision') {
    return issue(
      command.type === 'dynamicView.create' || command.type === 'deploymentView.create'
        ? 'view-id-collision'
        : 'deployment-id-collision',
      'Выбранный идентификатор уже занят.',
    )
  }
  if (code === 'invalid-identifier') {
    return issue('invalid-identifier', 'ID должен быть корректным идентификатором LikeC4.')
  }
  if (code === 'invalid-title') return issue('invalid-title', 'Название не может быть пустым.')
  if (code === 'ambiguous-reference') {
    return issue('ambiguous-target-document', 'Целевой документ нельзя определить однозначно.')
  }
  if (code === 'stale-document') return issue('stale-source-edit', 'Исходный код изменился. Повторите действие.')
  if (code === 'invalid-parent') {
    return issue('invalid-parent', 'Выбранная deployment-сущность не может быть родительским узлом.')
  }
  if (code === 'unsupported-reference') {
    return issue('semantic-operation-invalid', 'Этот тип deployment-ссылки не поддерживается.')
  }
  if (code === 'not-found') {
    if (command.type === 'dynamicStep.patch' || command.type === 'dynamicStep.remove') {
      return issue('dynamic-step-not-found', 'Выбранный направленный шаг больше не существует.')
    }
    if (command.type === 'deploymentRelation.patch' || command.type === 'deploymentRelation.remove') {
      return issue('deployment-relation-not-found', 'Выбранная связь развёртывания больше не существует.')
    }
    return issue(
      command.type === 'dynamicStep.create' || command.type === 'deploymentRelation.create'
        ? 'semantic-endpoint-not-found'
        : 'semantic-reference-not-found',
      'Выбранная сущность или ссылка больше не существует.',
    )
  }
  if (code === 'invalid-operation') {
    if (command.type === 'dynamicStep.remove') {
      return issue(
        'dynamic-step-remove-source-edit-failed',
        error instanceof Error ? error.message : 'Не удалось безопасно удалить направленный шаг.',
      )
    }
    return issue(
      command.type === 'deploymentElement.create' ? 'deployment-kind-unsupported' : 'semantic-operation-invalid',
      'Операция не поддерживается текущей спецификацией или областью.',
    )
  }
  switch (command.type) {
    case 'dynamicStep.patch':
      return issue('dynamic-step-patch-source-edit-failed', 'Не удалось изменить направленный шаг в исходном коде.')
    case 'dynamicStep.remove':
      return issue('dynamic-step-remove-source-edit-failed', 'Не удалось удалить направленный шаг из исходного кода.')
    case 'deploymentRelation.patch':
      return issue(
        'deployment-relation-patch-source-edit-failed',
        'Не удалось изменить связь развёртывания в исходном коде.',
      )
    case 'deploymentRelation.remove':
      return issue(
        'deployment-relation-remove-source-edit-failed',
        'Не удалось удалить связь развёртывания из исходного кода.',
      )
    default:
      return issue('wp06-source-edit-failed', 'Не удалось применить изменение к исходному коду.')
  }
}

function viewIds(model: NonNullable<CompileResult['model']>): Set<string> {
  return new Set(Object.keys(model.$data.views))
}

function deploymentElements(model: NonNullable<CompileResult['model']>): Readonly<Record<string, unknown>> {
  return model.$data.deployments.elements as Readonly<Record<string, unknown>>
}

function deploymentRelations(model: NonNullable<CompileResult['model']>): Readonly<Record<string, DeploymentRelation>> {
  return model.$data.deployments.relations as unknown as Readonly<Record<string, DeploymentRelation>>
}

function dynamicEdges(view: unknown): readonly SemanticEdge[] {
  if (!view || typeof view !== 'object') return []
  const record = view as Record<string, unknown>
  const candidates = Array.isArray(record['steps']) ? record['steps'] : Array.isArray(record['edges']) ? record['edges'] : []
  return candidates.filter((candidate): candidate is SemanticEdge => {
    return !!candidate && typeof candidate === 'object' && 'source' in candidate && 'target' in candidate
  })
}

function logicalEndpoint(reference: unknown): string | null {
  if (typeof reference === 'string') return reference
  if (!reference || typeof reference !== 'object') return null
  const record = reference as Record<string, unknown>
  if (typeof record['model'] !== 'string') return null
  return typeof record['project'] === 'string' ? `@${record['project']}.${record['model']}` : record['model']
}

function deploymentEndpoint(reference: unknown): string | null {
  if (typeof reference === 'string') return reference
  if (!reference || typeof reference !== 'object') return null
  const record = reference as Record<string, unknown>
  if (typeof record['element'] === 'string') return null
  return typeof record['deployment'] === 'string' ? record['deployment'] : null
}

function instanceTarget(element: unknown): string | null {
  if (!element || typeof element !== 'object') return null
  const target = (element as Record<string, unknown>)['element']
  return logicalEndpoint(target)
}

function dynamicEdgeById(view: unknown, id: string): SemanticEdge | null {
  return dynamicEdges(view).find(edge => edge.id === id) ?? null
}

function dynamicEdgeByAstPath(view: unknown, astPath: string): SemanticEdge | null {
  return dynamicEdges(view).find(edge => edge.astPath === astPath) ?? null
}

function multisetMatches(expected: readonly string[], actual: readonly string[]): boolean {
  if (expected.length !== actual.length) return false
  const counts = new Map<string, number>()
  for (const value of expected) counts.set(value, (counts.get(value) ?? 0) + 1)
  for (const value of actual) {
    const count = counts.get(value) ?? 0
    if (count === 0) return false
    if (count === 1) counts.delete(value)
    else counts.set(value, count - 1)
  }
  return counts.size === 0
}

function dynamicSignature(edge: SemanticEdge): string {
  return JSON.stringify([
    logicalEndpoint(edge.source),
    logicalEndpoint(edge.target),
    edge.label ?? '',
  ])
}

function dynamicRemainderMatchesAfterPatch(
  before: readonly SemanticEdge[],
  after: readonly SemanticEdge[],
  astPath: string,
): boolean {
  return multisetMatches(
    before.filter(edge => edge.astPath !== astPath).map(dynamicSignature),
    after.filter(edge => edge.astPath !== astPath).map(dynamicSignature),
  )
}

function dynamicRemainderMatchesAfterRemoval(
  before: readonly SemanticEdge[],
  after: readonly SemanticEdge[],
  astPath: string,
): boolean {
  return multisetMatches(
    before.filter(edge => edge.astPath !== astPath).map(dynamicSignature),
    after.map(dynamicSignature),
  )
}

function deploymentSignature(relation: DeploymentRelation): string {
  return JSON.stringify([
    deploymentEndpoint(relation.source),
    deploymentEndpoint(relation.target),
    relation.title ?? '',
  ])
}

function deploymentRemainderMatchesAfterPatch(
  before: Readonly<Record<string, DeploymentRelation>>,
  after: Readonly<Record<string, DeploymentRelation>>,
  id: string,
): boolean {
  return multisetMatches(
    Object.entries(before).filter(([relationId]) => relationId !== id).map(([, relation]) => deploymentSignature(relation)),
    Object.entries(after).filter(([relationId]) => relationId !== id).map(([, relation]) => deploymentSignature(relation)),
  )
}

function deploymentRemainderMatchesAfterRemoval(
  before: Readonly<Record<string, DeploymentRelation>>,
  after: Readonly<Record<string, DeploymentRelation>>,
  id: string,
): boolean {
  return multisetMatches(
    Object.entries(before).filter(([relationId]) => relationId !== id).map(([, relation]) => deploymentSignature(relation)),
    Object.values(after).map(deploymentSignature),
  )
}

async function compile(host: Wp06WorkspaceHost, sources: readonly SourceFile[]): Promise<{
  revision: number
  model: NonNullable<CompileResult['model']>
} | CommandResult> {
  const revision = host.state.revision + 1
  const result = await host.compileCandidate(revision, sources)
  if (!result.model) {
    return rejected(host.state, 'compile-rejected', 'Изменение отклонено компилятором LikeC4.')
  }
  return { revision, model: result.model }
}

function commit(
  host: Wp06WorkspaceHost,
  compiled: { revision: number; model: NonNullable<CompileResult['model']> },
  sources: readonly SourceFile[],
): CommandResult | null {
  if (!host.isCurrent()) return { status: 'conflict', revision: host.currentRevision() }
  host.commitCandidate(compiled.revision, sources, compiled.model, host.state.manualLayouts)
  return null
}

export async function applyWp06Command(host: Wp06WorkspaceHost): Promise<CommandResult> {
  const { state, command } = host
  const model = state.lastValidModel
  if (!model) return rejected(state, 'workspace-invalid', 'Исправьте ошибки в коде проекта.')

  try {
    if (command.type === 'dynamicView.create') {
      const id = command.input.id as ViewId
      if (model.$data.views[id]) return rejected(state, 'view-id-collision', 'ID вида уже занят.')
      const before = viewIds(model)
      const sources = await host.documents.createDynamicView(state.committedSources, command.input)
      const compiled = await compile(host, sources)
      if ('status' in compiled) return compiled
      const created = compiled.model.$data.views[id]
      const added = [...viewIds(compiled.model)].filter(candidate => !before.has(candidate))
      if (!created || created._type !== 'dynamic' || added.length !== 1 || added[0] !== id) {
        return rejected(state, 'dynamic-view-verification-failed', 'Не удалось подтвердить создание ровно одного dynamic view.')
      }
      const conflict = commit(host, compiled, sources)
      return conflict ?? { status: 'applied', command: command.type, revision: compiled.revision, createdViewId: id }
    }

    if (command.type === 'dynamicStep.create') {
      const { viewId, sourceId, targetId } = command.input
      const before = model.$data.views[viewId]
      if (!before || before._type !== 'dynamic') {
        return rejected(state, 'dynamic-view-not-found', 'Выбранный dynamic view не существует.')
      }
      if (!model.$data.elements[sourceId] || !model.$data.elements[targetId]) {
        return rejected(state, 'semantic-endpoint-not-found', 'Выбранный logical endpoint не существует.')
      }
      if (sourceId === targetId) return rejected(state, 'same-endpoint', 'Начало и конец шага должны различаться.')
      const beforeEdges = dynamicEdges(before)
      const sources = await host.documents.createDynamicStep(state.committedSources, command.input)
      const compiled = await compile(host, sources)
      if ('status' in compiled) return compiled
      const after = compiled.model.$data.views[viewId]
      const afterEdges = dynamicEdges(after)
      if (!after || after._type !== 'dynamic' || afterEdges.length !== beforeEdges.length + 1) {
        return rejected(state, 'dynamic-step-verification-failed', 'Не удалось подтвердить создание ровно одного dynamic step.')
      }
      const step = afterEdges[afterEdges.length - 1]!
      if (logicalEndpoint(step.source) !== sourceId || logicalEndpoint(step.target) !== targetId) {
        return rejected(state, 'dynamic-step-verification-failed', 'Созданный dynamic step не совпадает с выбранным направлением.')
      }
      const conflict = commit(host, compiled, sources)
      return conflict ?? {
        status: 'applied',
        command: command.type,
        revision: compiled.revision,
        createdStepId: step.id ?? `${viewId}:${beforeEdges.length}`,
        viewId,
      }
    }

    if (command.type === 'dynamicStep.patch') {
      const beforeView = model.$data.views[command.input.viewId]
      if (!beforeView || beforeView._type !== 'dynamic') {
        return rejected(state, 'dynamic-view-not-found', 'Выбранный динамический вид больше не существует.')
      }
      const selected = dynamicEdgeById(beforeView, command.input.id)
      if (!selected?.astPath) {
        return rejected(state, 'dynamic-step-not-found', 'Выбранный направленный шаг больше не существует.')
      }
      const title = command.input.patch.title?.trim()
      if (!title) return rejected(state, 'invalid-title', 'Название направленного шага не может быть пустым.')
      if (!host.documents.patchDynamicStep) {
        return rejected(state, 'dynamic-step-patch-source-edit-failed', 'Document layer не поддерживает изменение шага.')
      }
      const beforeEdges = dynamicEdges(beforeView)
      const sources = await host.documents.patchDynamicStep(state.committedSources, {
        viewId: command.input.viewId,
        astPath: selected.astPath,
        patch: { title },
      })
      const compiled = await compile(host, sources)
      if ('status' in compiled) return compiled
      const afterView = compiled.model.$data.views[command.input.viewId]
      if (!afterView || afterView._type !== 'dynamic') {
        return rejected(state, 'dynamic-step-patch-verification-failed', 'Динамический вид исчез после изменения шага.')
      }
      const afterEdges = dynamicEdges(afterView)
      const updated = dynamicEdgeByAstPath(afterView, selected.astPath)
      if (
        afterEdges.length !== beforeEdges.length
        || !updated
        || logicalEndpoint(updated.source) !== logicalEndpoint(selected.source)
        || logicalEndpoint(updated.target) !== logicalEndpoint(selected.target)
        || (updated.label ?? '') !== title
        || !dynamicRemainderMatchesAfterPatch(beforeEdges, afterEdges, selected.astPath)
      ) {
        return rejected(
          state,
          'dynamic-step-patch-verification-failed',
          'Не удалось подтвердить точное изменение выбранного направленного шага.',
        )
      }
      const conflict = commit(host, compiled, sources)
      return conflict ?? {
        status: 'applied',
        command: command.type,
        revision: compiled.revision,
        updatedStepId: updated.id ?? command.input.id,
        viewId: command.input.viewId,
      }
    }

    if (command.type === 'dynamicStep.remove') {
      const beforeView = model.$data.views[command.input.viewId]
      if (!beforeView || beforeView._type !== 'dynamic') {
        return rejected(state, 'dynamic-view-not-found', 'Выбранный динамический вид больше не существует.')
      }
      const selected = dynamicEdgeById(beforeView, command.input.id)
      if (!selected?.astPath) {
        return rejected(state, 'dynamic-step-not-found', 'Выбранный направленный шаг больше не существует.')
      }
      if (!host.documents.removeDynamicStep) {
        return rejected(state, 'dynamic-step-remove-source-edit-failed', 'Document layer не поддерживает удаление шага.')
      }
      const beforeEdges = dynamicEdges(beforeView)
      const sources = await host.documents.removeDynamicStep(state.committedSources, {
        viewId: command.input.viewId,
        astPath: selected.astPath,
      })
      const compiled = await compile(host, sources)
      if ('status' in compiled) return compiled
      const afterView = compiled.model.$data.views[command.input.viewId]
      if (!afterView || afterView._type !== 'dynamic') {
        return rejected(state, 'dynamic-step-remove-verification-failed', 'Динамический вид исчез после удаления шага.')
      }
      const afterEdges = dynamicEdges(afterView)
      if (
        afterEdges.length !== beforeEdges.length - 1
        || !dynamicRemainderMatchesAfterRemoval(beforeEdges, afterEdges, selected.astPath)
      ) {
        return rejected(
          state,
          'dynamic-step-remove-verification-failed',
          'Не удалось подтвердить удаление ровно выбранного направленного шага.',
        )
      }
      const conflict = commit(host, compiled, sources)
      return conflict ?? {
        status: 'applied',
        command: command.type,
        revision: compiled.revision,
        removedStepId: command.input.id,
        viewId: command.input.viewId,
      }
    }

    if (command.type === 'deploymentView.create') {
      const id = command.input.id as ViewId
      if (model.$data.views[id]) return rejected(state, 'view-id-collision', 'ID вида уже занят.')
      const before = viewIds(model)
      const sources = await host.documents.createDeploymentView(state.committedSources, command.input)
      const compiled = await compile(host, sources)
      if ('status' in compiled) return compiled
      const created = compiled.model.$data.views[id]
      const added = [...viewIds(compiled.model)].filter(candidate => !before.has(candidate))
      if (!created || created._type !== 'deployment' || added.length !== 1 || added[0] !== id) {
        return rejected(state, 'deployment-view-verification-failed', 'Не удалось подтвердить создание ровно одного deployment view.')
      }
      const conflict = commit(host, compiled, sources)
      return conflict ?? { status: 'applied', command: command.type, revision: compiled.revision, createdViewId: id }
    }

    if (command.type === 'deploymentElement.create') {
      const before = new Set(Object.keys(deploymentElements(model)))
      const expectedId = command.input.family === 'node'
        ? command.input.id
        : `${command.input.parentId}.${command.input.id}`
      const sources = command.input.family === 'node'
        ? await host.documents.createDeploymentNode(state.committedSources, command.input)
        : await host.documents.createDeploymentInstance(state.committedSources, command.input)
      const compiled = await compile(host, sources)
      if ('status' in compiled) return compiled
      const added = Object.keys(deploymentElements(compiled.model)).filter(id => !before.has(id))
      if (added.length !== 1 || added[0] !== expectedId) {
        return rejected(state, 'deployment-element-verification-failed', 'Не удалось подтвердить создание ровно одной deployment-сущности с ожидаемым ID.')
      }
      const createdId = added[0]! as Fqn
      const created = deploymentElements(compiled.model)[createdId]
      if (command.input.family === 'node') {
        const kind = created && typeof created === 'object' ? (created as Record<string, unknown>)['kind'] : undefined
        if (kind !== command.input.kind) {
          return rejected(state, 'deployment-element-verification-failed', 'Созданный deployment node имеет другой kind.')
        }
      } else if (instanceTarget(created) !== command.input.target) {
        return rejected(state, 'deployment-element-verification-failed', 'Созданный instanceOf ссылается на другой logical element.')
      }
      const conflict = commit(host, compiled, sources)
      return conflict ?? { status: 'applied', command: command.type, revision: compiled.revision, createdDeploymentId: createdId }
    }

    if (command.type === 'deploymentRelation.create') {
      const before = new Set(Object.keys(deploymentRelations(model)))
      const sources = await host.documents.createDeploymentRelation(state.committedSources, command.input)
      const compiled = await compile(host, sources)
      if ('status' in compiled) return compiled
      const added = Object.entries(deploymentRelations(compiled.model)).filter(([id]) => !before.has(id))
      if (added.length !== 1) {
        return rejected(state, 'deployment-relation-verification-failed', 'Не удалось подтвердить создание ровно одной deployment relation.')
      }
      const [id, relation] = added[0]!
      const source = deploymentEndpoint(relation.source)
      const target = deploymentEndpoint(relation.target)
      if (!source || !target) {
        return rejected(state, 'deployment-relation-verification-failed', 'Связи с вложенными logical references не поддерживаются.')
      }
      if (source !== command.input.sourceId || target !== command.input.targetId) {
        return rejected(state, 'deployment-relation-verification-failed', 'Созданная deployment relation не совпадает с выбранным направлением.')
      }
      const conflict = commit(host, compiled, sources)
      return conflict ?? {
        status: 'applied',
        command: command.type,
        revision: compiled.revision,
        createdRelationId: id as RelationId,
      }
    }

    if (command.type === 'deploymentRelation.patch') {
      const beforeRelations = deploymentRelations(model)
      const selected = beforeRelations[command.input.id]
      if (!selected) {
        return rejected(state, 'deployment-relation-not-found', 'Выбранная связь развёртывания больше не существует.')
      }
      const title = command.input.patch.title?.trim()
      if (!title) return rejected(state, 'invalid-title', 'Название связи развёртывания не может быть пустым.')
      if (!host.documents.patchDeploymentRelation) {
        return rejected(
          state,
          'deployment-relation-patch-source-edit-failed',
          'Document layer не поддерживает изменение связи развёртывания.',
        )
      }
      const sources = await host.documents.patchDeploymentRelation(state.committedSources, {
        id: command.input.id,
        patch: { title },
      })
      const compiled = await compile(host, sources)
      if ('status' in compiled) return compiled
      const afterRelations = deploymentRelations(compiled.model)
      const updated = afterRelations[command.input.id]
      if (
        Object.keys(afterRelations).length !== Object.keys(beforeRelations).length
        || !updated
        || deploymentEndpoint(updated.source) !== deploymentEndpoint(selected.source)
        || deploymentEndpoint(updated.target) !== deploymentEndpoint(selected.target)
        || (updated.title ?? '') !== title
        || !deploymentRemainderMatchesAfterPatch(beforeRelations, afterRelations, command.input.id)
      ) {
        return rejected(
          state,
          'deployment-relation-patch-verification-failed',
          'Не удалось подтвердить точное изменение выбранной связи развёртывания.',
        )
      }
      const conflict = commit(host, compiled, sources)
      return conflict ?? {
        status: 'applied',
        command: command.type,
        revision: compiled.revision,
        updatedRelationId: command.input.id,
      }
    }

    const beforeRelations = deploymentRelations(model)
    const selected = beforeRelations[command.input.id]
    if (!selected) {
      return rejected(state, 'deployment-relation-not-found', 'Выбранная связь развёртывания больше не существует.')
    }
    if (!host.documents.removeDeploymentRelation) {
      return rejected(
        state,
        'deployment-relation-remove-source-edit-failed',
        'Document layer не поддерживает удаление связи развёртывания.',
      )
    }
    const sources = await host.documents.removeDeploymentRelation(state.committedSources, { id: command.input.id })
    const compiled = await compile(host, sources)
    if ('status' in compiled) return compiled
    const afterRelations = deploymentRelations(compiled.model)
    if (
      Object.keys(afterRelations).length !== Object.keys(beforeRelations).length - 1
      || !deploymentRemainderMatchesAfterRemoval(beforeRelations, afterRelations, command.input.id)
    ) {
      return rejected(
        state,
        'deployment-relation-remove-verification-failed',
        'Не удалось подтвердить удаление ровно выбранной связи развёртывания.',
      )
    }
    const conflict = commit(host, compiled, sources)
    return conflict ?? {
      status: 'applied',
      command: command.type,
      revision: compiled.revision,
      removedRelationId: command.input.id,
    }
  } catch (error) {
    return { status: 'rejected', revision: state.revision, issues: [sourceIssue(command, error)] }
  }
}
