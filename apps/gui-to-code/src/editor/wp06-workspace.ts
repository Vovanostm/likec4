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
    | 'deploymentView.create'
    | 'deploymentElement.create'
    | 'deploymentRelation.create'
}>

type ManualLayouts = Readonly<Record<ViewId, ViewManualLayoutSnapshot>>
type SemanticEdge = { readonly source: unknown; readonly target: unknown; readonly id?: string }
type DeploymentRelation = { readonly source: unknown; readonly target: unknown }

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
  if (code === 'invalid-identifier') return issue('invalid-identifier', 'ID должен быть корректным идентификатором LikeC4.')
  if (code === 'ambiguous-reference') return issue('ambiguous-target-document', 'Целевой документ нельзя определить однозначно.')
  if (code === 'stale-document') return issue('stale-source-edit', 'Исходный код изменился. Повторите действие.')
  if (code === 'invalid-parent') return issue('deployment-parent-unsupported', 'Выбранная deployment-сущность не может быть родительским узлом.')
  if (code === 'unsupported-reference') return issue('semantic-operation-invalid', 'Этот тип deployment-ссылки не поддерживается в WP-06.')
  if (code === 'not-found') {
    return issue(
      command.type === 'dynamicStep.create' || command.type === 'deploymentRelation.create'
        ? 'semantic-endpoint-not-found'
        : command.type === 'deploymentElement.create' && command.input.family === 'instance'
        ? 'deployment-parent-not-found'
        : 'semantic-reference-not-found',
      'Выбранная сущность или ссылка больше не существует.',
    )
  }
  if (code === 'invalid-operation') {
    return issue(
      command.type === 'deploymentElement.create' ? 'deployment-kind-unsupported' : 'semantic-operation-invalid',
      'Операция не поддерживается текущей спецификацией или областью.',
    )
  }
  return issue('wp06-source-edit-failed', 'Не удалось применить изменение к исходному коду.')
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

function commit(host: Wp06WorkspaceHost, compiled: { revision: number; model: NonNullable<CompileResult['model']> }, sources: readonly SourceFile[]): CommandResult | null {
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
      if (!before || before._type !== 'dynamic') return rejected(state, 'dynamic-view-not-found', 'Выбранный dynamic view не существует.')
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
      return rejected(state, 'deployment-relation-verification-failed', 'Связи с вложенными logical references не поддерживаются в WP-06.')
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
  } catch (error) {
    return { status: 'rejected', revision: state.revision, issues: [sourceIssue(command, error)] }
  }
}
