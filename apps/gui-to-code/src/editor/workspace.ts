import { applyManualLayout } from '@likec4/core'
import { LikeC4Model } from '@likec4/core/model'
import type {
  DiagramNode,
  ElementKind,
  Fqn,
  RelationId,
  ViewId,
  ViewManualLayoutSnapshot,
} from '@likec4/core/types'
import { flattenMarkdownOrString } from '@likec4/core/types'
import { applyChangesToManualLayout, reconcileEdgeRoutes } from '@likec4/diagram/manual-layout'
import type {
  CanvasPosition,
  CommandIssue,
  CommandResult,
  CompileResult,
  CompilerPort,
  EditorCommand,
  EditorDocumentPort,
  EditorHistoryAction,
  EditorHistoryEntry,
  EditorOperation,
  EditorWorkspaceState,
  LayoutCommand,
  RemovalInspectionResult,
  SourceFile,
  WorkspaceDocumentSnapshot,
} from './contracts'
import { EditorDocumentError } from './contracts'
import { placeCreatedNode, placeNewlyVisibleNodes } from './creation-placement'
import { describeHistoryCommand } from './history'
import { parseSnapshot, snapshotFromLayout } from './layout-snapshots'
import type { PasteSubgraphInput, PasteSubgraphResult } from './professional-clipboard'
import type {
  MultiRemovalInspection,
  MultiRemovalInspectionResult,
  RemoveSubgraphResult,
} from './professional-removal'
import {
  applyPasteSubgraph,
  applyRemoveSubgraph,
  inspectMultiRemoval,
} from './professional-workspace'
import { applyWp06Command } from './wp06-workspace'

type CompiledElements = NonNullable<CompileResult['model']>['$data']['elements']
type CompiledRelations = NonNullable<CompileResult['model']>['$data']['relations']
type CompiledViews = NonNullable<CompileResult['model']>['$data']['views']
type ManualLayouts = Readonly<Record<ViewId, ViewManualLayoutSnapshot>>

let loadedDefaultPort: EditorDocumentPort | null = null
async function defaultPort(): Promise<EditorDocumentPort> {
  loadedDefaultPort ??= (await import('./language-services-adapter')).languageServicesDocumentPort
  return loadedDefaultPort
}

const defaultDocumentPort: EditorDocumentPort = {
  async createTag(sources, input) {
    const method = (await defaultPort()).createTag
    if (!method) throw new EditorDocumentError('invalid-operation', 'Tag creation is unavailable')
    return method(sources, input)
  },
  async createElement(sources, input) {
    return (await defaultPort()).createElement(sources, input)
  },
  async createRelation(sources, input) {
    return (await defaultPort()).createRelation(sources, input)
  },
  async createConnectedElement(sources, input) {
    const method = (await defaultPort()).createConnectedElement
    if (!method) throw new EditorDocumentError('invalid-operation', 'Connected element creation is unavailable')
    return method(sources, input)
  },
  async createView(sources, input) {
    return (await defaultPort()).createView(sources, input)
  },
  async createDynamicView(sources, input) {
    return (await defaultPort()).createDynamicView(sources, input)
  },
  async createDynamicStep(sources, input) {
    return (await defaultPort()).createDynamicStep(sources, input)
  },
  async patchDynamicStep(sources, input) {
    const method = (await defaultPort()).patchDynamicStep
    if (!method) throw new EditorDocumentError('invalid-operation', 'Dynamic step patch is unavailable')
    return method(sources, input)
  },
  async removeDynamicStep(sources, input) {
    const method = (await defaultPort()).removeDynamicStep
    if (!method) throw new EditorDocumentError('invalid-operation', 'Dynamic step removal is unavailable')
    return method(sources, input)
  },
  async createDeploymentView(sources, input) {
    return (await defaultPort()).createDeploymentView(sources, input)
  },
  async createDeploymentNode(sources, input) {
    return (await defaultPort()).createDeploymentNode(sources, input)
  },
  async createDeploymentInstance(sources, input) {
    return (await defaultPort()).createDeploymentInstance(sources, input)
  },
  async createDeploymentRelation(sources, input) {
    return (await defaultPort()).createDeploymentRelation(sources, input)
  },
  async patchDeploymentRelation(sources, input) {
    const method = (await defaultPort()).patchDeploymentRelation
    if (!method) throw new EditorDocumentError('invalid-operation', 'Deployment relation patch is unavailable')
    return method(sources, input)
  },
  async removeDeploymentRelation(sources, input) {
    const method = (await defaultPort()).removeDeploymentRelation
    if (!method) throw new EditorDocumentError('invalid-operation', 'Deployment relation removal is unavailable')
    return method(sources, input)
  },
  async patchElement(sources, input) {
    return (await defaultPort()).patchElement(sources, input)
  },
  async patchRelation(sources, input) {
    const method = (await defaultPort()).patchRelation
    if (!method) throw new EditorDocumentError('invalid-operation', 'Relation patch is unavailable')
    return method(sources, input)
  },
  async removeRelation(sources, input) {
    const method = (await defaultPort()).removeRelation
    if (!method) throw new EditorDocumentError('invalid-operation', 'Relation removal is unavailable')
    return method(sources, input)
  },
  async moveElement(sources, input) {
    return (await defaultPort()).moveElement(sources, input)
  },
  async renameElement(sources, input) {
    return (await defaultPort()).renameElement(sources, input)
  },
  async inspectRemoveElement(sources, id) {
    return (await defaultPort()).inspectRemoveElement(sources, id)
  },
  async removeElement(sources, input) {
    return (await defaultPort()).removeElement(sources, input)
  },
}

function cloneSources(sources: readonly SourceFile[]): SourceFile[] {
  return sources.map(source => ({ ...source }))
}

function sameSources(left: readonly SourceFile[], right: readonly SourceFile[]): boolean {
  if (left.length !== right.length) return false
  const rightByUri = new Map(right.map(source => [source.uri, source.content]))
  return left.every(source => rightByUri.get(source.uri) === source.content)
    && rightByUri.size === right.length
}

function cloneLayouts(layouts: ManualLayouts): Record<ViewId, ViewManualLayoutSnapshot> {
  const result = Object.create(null) as Record<ViewId, ViewManualLayoutSnapshot>
  for (const [id, snapshot] of Object.entries(layouts)) {
    result[id as ViewId] = structuredClone(snapshot)
  }
  return result
}

function documentSnapshot(sources: readonly SourceFile[], manualLayouts: ManualLayouts): WorkspaceDocumentSnapshot {
  return {
    sources: cloneSources(sources),
    manualLayouts: cloneLayouts(manualLayouts),
  }
}

function historyEntry(
  revision: number,
  sources: readonly SourceFile[],
  manualLayouts: ManualLayouts,
  action: EditorHistoryAction,
): EditorHistoryEntry {
  return { revision, document: documentSnapshot(sources, manualLayouts), action }
}

function issue(code: CommandIssue['code'], message: string): CommandIssue {
  return { code, message }
}

function availableKinds(state: EditorWorkspaceState): Set<string> {
  return new Set(Object.keys(state.lastValidModel?.$data.specification.elements ?? {}))
}

function allocateId(state: EditorWorkspaceState, kind: ElementKind): string {
  const existing = new Set(Object.keys(state.lastValidModel?.$data.elements ?? {}))
  if (!existing.has(kind)) return kind
  for (let suffix = 2;; suffix += 1) {
    const candidate = `${kind}${suffix}`
    if (!existing.has(candidate)) return candidate
  }
}

function allocateCanvasId(state: EditorWorkspaceState, kind: ElementKind, parent: Fqn | null): string {
  const existing = new Set(Object.keys(state.lastValidModel?.$data.elements ?? {}))
  const available = (candidate: string): boolean => {
    const scoped = parent ? `${parent}.${candidate}` : candidate
    return !existing.has(candidate) && !existing.has(scoped)
  }
  if (available(kind)) return kind
  for (let suffix = 2;; suffix += 1) {
    const candidate = `${kind}${suffix}`
    if (available(candidate)) return candidate
  }
}

function scopedElementId(id: string, parent: Fqn | null): Fqn {
  return (parent ? `${parent}.${id}` : id) as Fqn
}

function allocateViewId(state: EditorWorkspaceState): ViewId {
  const existing = new Set(Object.keys(state.lastValidModel?.$data.views ?? {}))
  // `view` is a DSL keyword and is parsed as an anonymous declaration.
  for (let suffix = 1;; suffix += 1) {
    const candidate = `view${suffix}`
    if (!existing.has(candidate)) return candidate as ViewId
  }
}

function localEndpoint(reference: { readonly model: string; readonly project?: string }): string {
  return reference.project ? `@${reference.project}.${reference.model}` : reference.model
}

function localId(id: Fqn): string {
  return id.slice(id.lastIndexOf('.') + 1)
}

function parentId(id: Fqn): string | null {
  const index = id.lastIndexOf('.')
  return index < 0 ? null : id.slice(0, index)
}

function subtreeIds(state: EditorWorkspaceState, root: Fqn): Fqn[] {
  return Object.keys(state.lastValidModel?.$data.elements ?? {})
    .filter(id => id === root || id.startsWith(`${root}.`))
    .sort()
    .map(id => id as Fqn)
}

function mappedSubtree(ids: readonly Fqn[], oldRoot: Fqn, newRoot: Fqn): Fqn[] {
  return ids.map(id => `${newRoot}${id === oldRoot ? '' : id.slice(oldRoot.length)}` as Fqn)
}

function equalStringArrays(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  const a = [...(left ?? [])].sort()
  const b = [...(right ?? [])].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function semanticData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticData)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, semanticData(entry)]),
    )
  }
  return value
}

function authoredViews(views: CompiledViews): CompiledViews {
  // The language service always adds an index view without source provenance.
  return Object.fromEntries(
    Object.entries(views).filter(([id, view]) => id !== 'index' || view.sourcePath !== undefined),
  )
}

function sourceFailure(command: EditorCommand['type'], error: unknown): CommandIssue {
  if (
    error instanceof TypeError &&
    /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i
      .test(error.message)
  ) {
    return issue(
      command === 'element.createConnected' ? 'create-connected-source-edit-failed' : 'source-edit-failed',
      'Не удалось загрузить модуль редактирования. Проверьте, работает ли сервер приложения, и обновите страницу.',
    )
  }
  const documentError = error instanceof EditorDocumentError ? error : null
  const code = documentError?.code
  switch (code) {
    case 'not-found':
      return command === 'diagram.create'
        ? issue(
          'source-edit-failed',
          'Целевой документ недоступен или не содержит раздел model. Выберите документ с моделью.',
        )
        : command === 'view.create'
        ? issue('view-scope-not-found', 'Область или целевой документ для вида больше не существует.')
        : command === 'relation.patch' || command === 'relation.remove'
        ? issue('relation-not-found', 'Выбранная связь больше не существует.')
        : issue('element-not-found', 'Выбранный элемент больше не существует.')
    case 'invalid-title':
      return issue('invalid-title', 'Название не может быть пустым.')
    case 'invalid-tag':
      return issue('invalid-tag', 'Выбранный тег отсутствует в спецификации проекта.')
    case 'invalid-parent':
      return issue('invalid-parent', 'Выбранный родитель недоступен.')
    case 'move-cycle':
      return issue('move-cycle', 'Нельзя переместить элемент внутрь его собственного поддерева.')
    case 'invalid-identifier':
      return issue('invalid-identifier', 'ID должен быть корректным идентификатором LikeC4.')
    case 'unsupported-reference':
    case 'ambiguous-reference':
      return issue('unsupported-reference', 'Некоторые ссылки нельзя обновить безопасно.')
    case 'stale-document':
      return command === 'element.remove'
        ? issue('removal-report-stale', 'Зависимости изменились. Проверьте удаление ещё раз.')
        : issue(
          command === 'element.patch'
            ? 'patch-source-edit-failed'
            : command === 'element.move'
            ? 'move-source-edit-failed'
            : command === 'element.rename'
            ? 'rename-source-edit-failed'
            : command === 'relation.patch'
            ? 'relation-patch-source-edit-failed'
            : command === 'relation.remove'
            ? 'relation-remove-source-edit-failed'
            : command === 'element.createConnected'
            ? 'create-connected-source-edit-failed'
            : command === 'view.create'
            ? 'view-source-edit-failed'
            : 'source-edit-failed',
          'Исходный код изменился. Повторите действие.',
        )
    case 'dependencies-not-approved':
      return issue('removal-approval-mismatch', 'Подтверждение не совпадает с актуальным списком зависимостей.')
    case 'unsupported-cascade':
      return issue('removal-unsupported', 'Некоторые зависимости нельзя удалить безопасно.')
    case 'collision':
      return command === 'element.move'
        ? issue('move-collision', 'Перемещение создаёт конфликт идентификаторов.')
        : command === 'element.rename'
        ? issue('rename-collision', 'Переименование создаёт конфликт идентификаторов.')
        : command === 'view.create'
        ? issue('view-id-collision', 'ID вида уже занят.')
        : issue('identifier-collision', 'Идентификатор уже занят.')
    default:
      return issue(
        command === 'element.patch'
          ? 'patch-source-edit-failed'
          : command === 'element.move'
          ? 'move-source-edit-failed'
          : command === 'element.rename'
          ? 'rename-source-edit-failed'
          : command === 'element.remove'
          ? 'remove-source-edit-failed'
          : command === 'relation.create'
          ? 'relation-source-edit-failed'
          : command === 'relation.patch'
          ? 'relation-patch-source-edit-failed'
          : command === 'relation.remove'
          ? 'relation-remove-source-edit-failed'
          : command === 'element.createConnected'
          ? 'create-connected-source-edit-failed'
          : command === 'view.create'
          ? 'view-source-edit-failed'
          : 'source-edit-failed',
        'Не удалось применить изменение к исходному коду.',
      )
  }
}

/** Materialize snapshots already validated/reconciled by compatibleLayouts. */
function materializeModel(autoModel: LikeC4Model.Layouted, manualLayouts: ManualLayouts): LikeC4Model.Layouted {
  return LikeC4Model.create({
    ...autoModel.$data,
    manualLayouts,
  })
}

function compatibleLayouts(
  autoModel: LikeC4Model.Layouted,
  manualLayouts: ManualLayouts,
): Record<ViewId, ViewManualLayoutSnapshot> {
  const result = Object.create(null) as Record<ViewId, ViewManualLayoutSnapshot>
  for (const [id, snapshot] of Object.entries(manualLayouts)) {
    const view = autoModel.$data.views[id as ViewId]
    if (!view) continue
    const parsed = parseSnapshot(snapshot, id as ViewId, view._type)
    if (!parsed.ok) continue
    // A live editor always displays current semantics. Keep the portable geometry,
    // while the renderer reconciles deleted entities and changed labels/sizes.
    result[id as ViewId] = parsed.snapshot.hash === view.hash
      ? reconcileSnapshot(view, parsed.snapshot)
      : mergeManualLayout(view, parsed.snapshot)
  }
  return result
}

function positionIsValid(position: CanvasPosition): boolean {
  return Number.isFinite(position.x) && Number.isFinite(position.y)
}

/** Repair geometry without replacing snapshot semantics or normalizing preserved fields. */
function reconcileSnapshot(
  autoView: NonNullable<CompileResult['model']>['$data']['views'][ViewId],
  snapshot: ViewManualLayoutSnapshot,
  previousNodes: readonly DiagramNode[] = [],
): ViewManualLayoutSnapshot {
  const repaired = reconcileEdgeRoutes({
    ...autoView,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    bounds: snapshot.bounds,
  }, previousNodes)
  return { ...snapshot, edges: repaired.edges, bounds: repaired.bounds }
}

function mergeManualLayout(
  autoView: NonNullable<CompileResult['model']>['$data']['views'][ViewId],
  previous: ViewManualLayoutSnapshot,
): ViewManualLayoutSnapshot {
  const manual = applyManualLayout(autoView, previous)
  const snapshot = snapshotFromLayout(applyChangesToManualLayout({
    ...manual,
    nodes: previous.nodes,
    edges: previous.edges,
  }, autoView))
  if (autoView._type !== 'element') return snapshot
  const retainedIds = new Set(previous.nodes.map(node => node.id))
  if (snapshot.nodes.every(node => retainedIds.has(node.id))) return snapshot
  const nodes = placeNewlyVisibleNodes(snapshot.nodes, previous.nodes)
  if (!nodes) throw new Error('Не удалось разместить новые элементы без наложений. Проверьте ручную раскладку.')
  return reconcileSnapshot(autoView, { ...snapshot, nodes }, snapshot.nodes)
}

export class EditorWorkspace {
  private current: EditorWorkspaceState
  private operationQueue: Promise<void> = Promise.resolve()
  private pendingCompileRevision = 0

  private constructor(
    state: EditorWorkspaceState,
    private readonly compiler: CompilerPort,
    private readonly documents: EditorDocumentPort,
  ) {
    this.current = state
  }

  static async create(
    sources: readonly SourceFile[],
    compiler: CompilerPort,
    documents: EditorDocumentPort = defaultDocumentPort,
    projectId = 'default',
    manualLayouts: ManualLayouts = {} as ManualLayouts,
    entryDocumentUri = sources[0]?.uri ?? 'model.c4',
    initialRevision = 0,
  ): Promise<EditorWorkspace> {
    if (!sources.some(source => source.uri === entryDocumentUri)) {
      throw new Error(`Entry document ${entryDocumentUri} is unavailable`)
    }
    const compilation = await compiler({ revision: initialRevision, sources })
    const layouts = compilation.model ? compatibleLayouts(compilation.model, manualLayouts) : Object.create(null)
    const model = compilation.model ? materializeModel(compilation.model, layouts) : null
    const state: EditorWorkspaceState = {
      version: 2,
      projectId,
      entryDocumentUri,
      revision: initialRevision,
      committedSources: cloneSources(sources),
      draftSources: cloneSources(sources),
      manualLayouts: layouts,
      compilation: {
        revision: initialRevision,
        status: model ? 'valid' : 'invalid',
        diagnostics: compilation.diagnostics,
        model,
      },
      lastValidModel: model,
      history: { past: [], future: [], current: { type: 'workspace.open', label: 'Начальное состояние' } },
    }
    return new EditorWorkspace(state, compiler, documents)
  }

  get state(): EditorWorkspaceState {
    return this.current
  }

  async updateDraft(sources: readonly SourceFile[]): Promise<void> {
    const requestedRevision = ++this.pendingCompileRevision
    this.current = {
      ...this.current,
      draftSources: cloneSources(sources),
      compilation: {
        ...this.current.compilation,
        status: 'compiling',
        diagnostics: [],
      },
    }
    const result = await this.compiler({ revision: requestedRevision, sources })
    if (result.revision !== this.pendingCompileRevision) return
    if (!result.model) {
      this.current = {
        ...this.current,
        draftSources: cloneSources(sources),
        compilation: {
          revision: this.current.revision,
          status: 'invalid',
          diagnostics: result.diagnostics,
          model: null,
        },
      }
      return
    }
    const previous = this.current
    if (sameSources(previous.committedSources, sources)) {
      const manualLayouts = compatibleLayouts(result.model, previous.manualLayouts)
      const model = materializeModel(result.model, manualLayouts)
      this.current = {
        ...previous,
        manualLayouts,
        draftSources: cloneSources(sources),
        compilation: {
          revision: previous.revision,
          status: 'valid',
          diagnostics: [],
          model,
        },
        lastValidModel: model,
      }
      return
    }
    const revision = previous.revision + 1
    const manualLayouts = compatibleLayouts(result.model, previous.manualLayouts)
    const model = materializeModel(result.model, manualLayouts)
    this.current = {
      ...previous,
      revision,
      manualLayouts,
      committedSources: cloneSources(sources),
      draftSources: cloneSources(sources),
      compilation: {
        revision,
        status: 'valid',
        diagnostics: [],
        model,
      },
      lastValidModel: model,
      history: {
        past: [
          ...previous.history.past,
          historyEntry(previous.revision, previous.committedSources, previous.manualLayouts, previous.history.current),
        ],
        future: [],
        current: {
          type: 'source.edit',
          label: `Изменение кода: ${
            sources.filter(source =>
              previous.committedSources.find(old => old.uri === source.uri)?.content !== source.content
            ).map(source => source.uri).join(', ')
          }`,
        },
      },
    }
  }

  dispatch(operation: EditorOperation): Promise<CommandResult> {
    return this.enqueue(() => this.applyOperation(operation))
  }

  undo(expectedRevision: number): Promise<CommandResult> {
    return this.enqueue(() => this.applyUndo(expectedRevision))
  }

  redo(expectedRevision: number): Promise<CommandResult> {
    return this.enqueue(() => this.applyRedo(expectedRevision))
  }

  /** Restore a chronological history position atomically, compiling only the target state. */
  goToHistory(index: number, expectedRevision: number): Promise<CommandResult> {
    return this.enqueue(() => this.applyHistoryPosition(index, expectedRevision))
  }

  inspectElementRemoval(id: Fqn, expectedRevision: number): Promise<RemovalInspectionResult> {
    return this.enqueue(() => this.applyRemovalInspection(id, expectedRevision))
  }

  inspectSubgraphRemoval(ids: readonly Fqn[], expectedRevision: number): Promise<MultiRemovalInspectionResult> {
    return this.enqueue(() => {
      const state = this.current
      return inspectMultiRemoval(
        {
          state,
          inspectElementRemoval: (sources, id) => this.documents.inspectRemoveElement(sources, id),
          isCurrent: () => this.isCurrent(state),
          currentRevision: () => this.current.revision,
        },
        ids,
        expectedRevision,
      )
    })
  }

  removeSubgraph(inspection: MultiRemovalInspection, expectedRevision: number): Promise<RemoveSubgraphResult> {
    return this.enqueue(() => {
      const state = this.current
      return applyRemoveSubgraph(
        {
          state,
          compileCandidate: (revision, sources) => this.compileCandidate(revision, sources),
          commitCandidate: (revision, sources, model, layouts) =>
            this.commitCandidate(state, revision, sources, model, layouts, {
              type: 'subgraph.remove',
              label: 'Удаление выбранных элементов',
            }),
          isCurrent: () => this.isCurrent(state),
          currentRevision: () => this.current.revision,
        },
        inspection,
        expectedRevision,
      )
    })
  }

  pasteSubgraph(input: PasteSubgraphInput, expectedRevision: number): Promise<PasteSubgraphResult> {
    return this.enqueue(() => {
      const state = this.current
      return applyPasteSubgraph(
        {
          state,
          compileCandidate: (revision, sources) => this.compileCandidate(revision, sources),
          commitCandidate: (revision, sources, model, layouts) =>
            this.commitCandidate(state, revision, sources, model, layouts, {
              type: 'subgraph.paste',
              label: 'Вставка элементов',
            }),
          isCurrent: () => this.isCurrent(state),
          currentRevision: () => this.current.revision,
        },
        input,
        expectedRevision,
      )
    })
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    let resolveResult!: (result: T) => void
    let rejectResult!: (error: unknown) => void
    const result = new Promise<T>((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })
    this.operationQueue = this.operationQueue.then(async () => {
      try {
        resolveResult(await action())
      } catch (error) {
        rejectResult(error)
      }
    })
    return result
  }

  private invalidWorkspaceResult(state: EditorWorkspaceState): CommandResult | null {
    if (state.compilation.status === 'valid') return null
    return {
      status: 'rejected',
      revision: state.revision,
      issues: [issue('workspace-invalid', 'Изменение отклонено: исправьте ошибки в коде проекта.')],
    }
  }

  private async applyOperation(operation: EditorOperation): Promise<CommandResult> {
    const state = this.current
    if (operation.expectedRevision !== state.revision) {
      return { status: 'conflict', revision: state.revision }
    }
    const invalid = this.invalidWorkspaceResult(state)
    if (invalid) return invalid

    if (operation.semantic && operation.layout) {
      return this.rejected(
        state,
        'combined-operation-unsupported',
        'Совмещённая semantic/layout операция пока не используется текущим интерфейсом.',
      )
    }
    if (operation.layout) {
      return this.applyLayout(state, operation.layout)
    }
    if (!operation.semantic) {
      return this.rejected(state, 'combined-operation-unsupported', 'Пустая операция недопустима.')
    }

    const historyAction = describeHistoryCommand(operation.semantic)
    switch (operation.semantic.type) {
      case 'tag.create':
        return this.applyCreateTag(state, operation.semantic)
      case 'diagram.create':
        return this.applyCreateDiagram(state, operation.semantic)
      case 'element.create':
        return this.applyCreateElement(state, operation.semantic)
      case 'element.createAt':
        return this.applyCreateElementAt(state, operation.semantic)
      case 'element.createConnected':
        return this.applyCreateConnectedElement(state, operation.semantic)
      case 'relation.create':
        return this.applyCreateRelation(state, operation.semantic)
      case 'relation.patch':
        return this.applyPatchRelation(state, operation.semantic)
      case 'relation.remove':
        return this.applyRemoveRelation(state, operation.semantic)
      case 'view.create':
        return this.applyCreateView(state, operation.semantic)
      case 'dynamicView.create':
      case 'dynamicStep.create':
      case 'dynamicStep.patch':
      case 'dynamicStep.remove':
      case 'deploymentView.create':
      case 'deploymentElement.create':
      case 'deploymentRelation.create':
      case 'deploymentRelation.patch':
      case 'deploymentRelation.remove':
        return applyWp06Command({
          state,
          command: operation.semantic,
          documents: this.documents,
          compileCandidate: (revision, sources) => this.compileCandidate(revision, sources),
          commitCandidate: (revision, sources, model, layouts) =>
            this.commitCandidate(state, revision, sources, model, layouts, historyAction),
          isCurrent: () => this.isCurrent(state),
          currentRevision: () => this.current.revision,
        })
      case 'element.patch':
        return this.applyPatchElement(state, operation.semantic)
      case 'element.move':
        return this.applyMoveElement(state, operation.semantic)
      case 'element.rename':
        return this.applyRenameElement(state, operation.semantic)
      case 'element.remove':
        return this.applyRemoveElement(state, operation.semantic)
    }
  }

  private async applyCreateDiagram(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'diagram.create' }>,
  ): Promise<CommandResult> {
    const before = state.lastValidModel?.$data
    if (!before || Object.keys(before.elements).length > 0 || Object.keys(authoredViews(before.views)).length > 0) {
      return this.rejected(state, 'bootstrap-project-not-empty', 'Начать диаграмму можно только в пустом проекте.')
    }
    const invalidKind = this.validateCreateKind(state, command.input.kind)
    if (invalidKind) return invalidKind
    const title = command.input.title?.trim()
    if (title !== undefined && !title) {
      return this.rejected(state, 'invalid-title', 'Название диаграммы не может быть пустым.')
    }
    const createdElementId = allocateId(state, command.input.kind) as Fqn
    const createdViewId = allocateViewId(state)
    const documentUri = command.input.documentUri
    try {
      const elementSources = await this.documents.createElement(cloneSources(state.committedSources), {
        id: createdElementId,
        kind: command.input.kind,
        ...(title !== undefined ? { title } : {}),
        ...(documentUri !== undefined ? { documentUri } : {}),
      })
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      const candidateSources = await this.documents.createView(cloneSources(elementSources), {
        id: createdViewId,
        title: 'Контекст архитектуры',
        ...(documentUri !== undefined ? { documentUri } : {}),
      })
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      if (!compilation.model) return this.compileRejected(state)
      const after = compilation.model.$data
      const root = after.elements[createdElementId]
      const view = after.views[createdViewId]
      const unchanged = (data: typeof before) =>
        Object.fromEntries(
          Object.entries(data).filter(([key]) => key !== 'elements' && key !== 'views' && key !== 'manualLayouts'),
        )
      if (
        Object.keys(after.elements).length !== 1
        || !root || root.id !== createdElementId || root.kind !== command.input.kind
        || root.title !== (title ?? createdElementId)
        || Object.keys(authoredViews(after.views)).length !== 1
        || !view || view._type !== 'element' || view.viewOf !== undefined
        || view.title !== 'Контекст архитектуры'
        || view.nodes.length !== 1 || view.nodes[0]?.modelRef !== createdElementId
        || JSON.stringify(semanticData(unchanged(before))) !== JSON.stringify(semanticData(unchanged(after)))
      ) {
        return this.rejected(state, 'created-view-not-found', 'Не удалось подтвердить точное создание диаграммы.')
      }
      this.commitCandidate(
        state,
        revision,
        candidateSources,
        compilation.model,
        state.manualLayouts,
        describeHistoryCommand(command),
      )
      return { status: 'applied', command: 'diagram.create', revision, createdElementId, createdViewId }
    } catch (error) {
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      return { status: 'rejected', revision: state.revision, issues: [sourceFailure(command.type, error)] }
    }
  }

  private async applyCreateElement(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'element.create' }>,
  ): Promise<CommandResult> {
    const invalidKind = this.validateCreateKind(state, command.input.kind)
    if (invalidKind) return invalidKind
    const parent = command.input.parentId ?? null
    if (parent && !state.lastValidModel?.$data.elements[parent]) {
      return this.rejected(state, 'element-not-found', 'Родительский элемент больше не существует.')
    }
    const id = command.input.id ?? (parent
      ? allocateCanvasId(state, command.input.kind, parent)
      : allocateId(state, command.input.kind))
    try {
      const candidateSources = await this.documents.createElement(state.committedSources, {
        id,
        kind: command.input.kind,
        ...(parent ? { parentId: parent } : {}),
        ...(command.input.title ? { title: command.input.title } : {}),
        ...(command.input.documentUri ? { documentUri: command.input.documentUri } : {}),
      })
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)
      const createdElementId = scopedElementId(id, parent)
      if (!compilation.model.$data.elements[createdElementId]) {
        return this.rejected(
          state,
          'created-element-not-found',
          'Созданный элемент отсутствует в скомпилированной модели.',
        )
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(
        state,
        revision,
        candidateSources,
        compilation.model,
        state.manualLayouts,
        describeHistoryCommand(command),
      )
      return { status: 'applied', command: 'element.create', revision, createdElementId }
    } catch (error) {
      return { status: 'rejected', revision: state.revision, issues: [sourceFailure(command.type, error)] }
    }
  }

  private async applyCreateElementAt(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'element.createAt' }>,
  ): Promise<CommandResult> {
    const invalidKind = this.validateCreateKind(state, command.input.kind)
    if (invalidKind) return invalidKind
    if (!positionIsValid(command.input.position)) {
      return this.rejected(state, 'invalid-position', 'Позиция создания на холсте некорректна.')
    }
    const view = state.lastValidModel?.$data.views[command.input.viewId]
    if (!view) return this.rejected(state, 'layout-view-not-found', 'Выбранный вид больше не существует.')
    if (view._type !== 'element') {
      return this.rejected(
        state,
        'layout-view-unsupported',
        'Создание логического элемента доступно только в статическом виде.',
      )
    }
    const parent = view.viewOf ?? null
    const id = command.input.id ?? allocateCanvasId(state, command.input.kind, parent)
    const createdElementId = scopedElementId(id, parent)
    if (state.lastValidModel?.$data.elements[id as Fqn] || state.lastValidModel?.$data.elements[createdElementId]) {
      return this.rejected(state, 'identifier-collision', 'Идентификатор уже занят.')
    }
    try {
      const candidateSources = await this.documents.createElement(state.committedSources, {
        id,
        kind: command.input.kind,
        ...(command.input.title ? { title: command.input.title } : {}),
        ...(parent ? { parentId: parent } : {}),
        ...(command.input.documentUri ? { documentUri: command.input.documentUri } : {}),
      })
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)
      if (!compilation.model.$data.elements[createdElementId]) {
        return this.rejected(
          state,
          'created-element-not-found',
          'Созданный элемент отсутствует в скомпилированной модели.',
        )
      }
      const nextLayouts = this.positionedLayouts(
        state,
        compilation.model,
        command.input.viewId,
        createdElementId,
        command.input.position,
      )
      if (!nextLayouts) {
        return this.rejected(
          state,
          'layout-created-element-not-found',
          'Созданный элемент не отображается в выбранном виде.',
        )
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(
        state,
        revision,
        candidateSources,
        compilation.model,
        nextLayouts,
        describeHistoryCommand(command),
      )
      return {
        status: 'applied',
        command: 'element.createAt',
        revision,
        createdElementId,
        viewId: command.input.viewId,
      }
    } catch (error) {
      return { status: 'rejected', revision: state.revision, issues: [sourceFailure(command.type, error)] }
    }
  }

  private async applyCreateConnectedElement(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'element.createConnected' }>,
  ): Promise<CommandResult> {
    const invalidKind = this.validateCreateKind(state, command.input.kind)
    if (invalidKind) return invalidKind
    if (!positionIsValid(command.input.position)) {
      return this.rejected(state, 'invalid-position', 'Позиция создания на холсте некорректна.')
    }
    if (!state.lastValidModel?.$data.elements[command.input.sourceId]) {
      return this.rejected(state, 'source-element-not-found', 'Исходный элемент больше не существует.')
    }
    const view = state.lastValidModel.$data.views[command.input.viewId]
    if (!view) return this.rejected(state, 'layout-view-not-found', 'Выбранный вид больше не существует.')
    if (view._type !== 'element') {
      return this.rejected(
        state,
        'layout-view-unsupported',
        'Создание элемента со связью доступно только в статическом виде.',
      )
    }
    if (!this.documents.createConnectedElement) {
      return this.rejected(
        state,
        'create-connected-source-edit-failed',
        'Document layer не поддерживает атомарное создание элемента со связью.',
      )
    }
    const parent = view.viewOf ?? null
    const id = command.input.id ?? allocateCanvasId(state, command.input.kind, parent)
    const createdElementId = scopedElementId(id, parent)
    if (state.lastValidModel.$data.elements[id as Fqn] || state.lastValidModel.$data.elements[createdElementId]) {
      return this.rejected(state, 'identifier-collision', 'Идентификатор уже занят.')
    }
    try {
      const candidateSources = await this.documents.createConnectedElement(state.committedSources, {
        sourceId: command.input.sourceId,
        kind: command.input.kind,
        id,
        ...(command.input.title ? { title: command.input.title } : {}),
        ...(parent ? { parentId: parent } : {}),
        ...(command.input.documentUri ? { documentUri: command.input.documentUri } : {}),
      })
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)

      const addedElements = Object.keys(compilation.model.$data.elements)
        .filter(elementId => !state.lastValidModel?.$data.elements[elementId])
      const previousRelationIds = new Set(Object.keys(state.lastValidModel?.$data.relations ?? {}))
      const addedRelations = Object.entries(compilation.model.$data.relations ?? {})
        .filter(([relationId]) => !previousRelationIds.has(relationId))
      if (addedElements.length !== 1 || addedElements[0] !== createdElementId || addedRelations.length !== 1) {
        return this.rejected(
          state,
          'create-connected-verification-failed',
          'Не удалось подтвердить точный semantic delta создания.',
        )
      }
      const [createdRelationId, relation] = addedRelations[0]!
      if (
        localEndpoint(relation.source) !== command.input.sourceId
        || localEndpoint(relation.target) !== createdElementId
      ) {
        return this.rejected(
          state,
          'create-connected-verification-failed',
          'Созданная связь не совпадает с выбранным направлением.',
        )
      }
      const nextLayouts = this.positionedLayouts(
        state,
        compilation.model,
        command.input.viewId,
        createdElementId,
        command.input.position,
      )
      if (!nextLayouts) {
        return this.rejected(
          state,
          'layout-created-element-not-found',
          'Созданный элемент не отображается в выбранном виде.',
        )
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(
        state,
        revision,
        candidateSources,
        compilation.model,
        nextLayouts,
        describeHistoryCommand(command),
      )
      return {
        status: 'applied',
        command: 'element.createConnected',
        revision,
        createdElementId,
        createdRelationId: createdRelationId as RelationId,
        viewId: command.input.viewId,
      }
    } catch (error) {
      return { status: 'rejected', revision: state.revision, issues: [sourceFailure(command.type, error)] }
    }
  }

  private async applyCreateRelation(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'relation.create' }>,
  ): Promise<CommandResult> {
    const { sourceId, targetId } = command.input
    const elements = state.lastValidModel?.$data.elements ?? {}
    if (!elements[sourceId]) {
      return this.rejected(state, 'source-element-not-found', 'Исходный элемент больше не существует.')
    }
    if (!elements[targetId]) {
      return this.rejected(state, 'target-element-not-found', 'Целевой элемент больше не существует.')
    }
    if (sourceId === targetId) return this.rejected(state, 'same-endpoint', 'Нельзя связать элемент с самим собой.')

    try {
      const candidateSources = await this.documents.createRelation(state.committedSources, {
        sourceId,
        targetId,
        ...(command.input.documentUri ? { documentUri: command.input.documentUri } : {}),
      })
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)

      const previousIds = new Set(Object.keys(state.lastValidModel?.$data.relations ?? {}))
      const added = Object.entries(compilation.model.$data.relations ?? {})
        .filter(([relationId]) => !previousIds.has(relationId))
      if (added.length !== 1) {
        return this.rejected(state, 'created-relation-not-found', 'Не удалось однозначно подтвердить созданную связь.')
      }
      const [createdRelationId, relation] = added[0]!
      if (localEndpoint(relation.source) !== sourceId || localEndpoint(relation.target) !== targetId) {
        return this.rejected(
          state,
          'created-relation-not-found',
          'Созданная связь не совпадает с выбранным направлением.',
        )
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      const nextLayouts = Object.fromEntries(
        Object.entries(state.manualLayouts).flatMap(([viewId, previous]) => {
          const autoView = compilation.model!.$data.views[viewId as ViewId]
          if (!autoView || autoView._type !== previous._type) return []
          return [[viewId, mergeManualLayout(autoView, previous)]]
        }),
      ) as ManualLayouts
      this.commitCandidate(
        state,
        revision,
        candidateSources,
        compilation.model,
        nextLayouts,
        describeHistoryCommand(command),
      )
      return {
        status: 'applied',
        command: 'relation.create',
        revision,
        createdRelationId: createdRelationId as RelationId,
      }
    } catch (error) {
      return { status: 'rejected', revision: state.revision, issues: [sourceFailure(command.type, error)] }
    }
  }

  private async applyCreateTag(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'tag.create' }>,
  ): Promise<CommandResult> {
    const name = command.input.name.trim()
    if (!/^([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*$/.test(name)) {
      return this.rejected(
        state,
        'invalid-identifier',
        'Имя тега: латинские буквы, цифры, дефис или подчёркивание; начните с буквы.',
      )
    }
    if (Object.hasOwn(state.lastValidModel?.$data.specification.tags ?? {}, name)) {
      return this.rejected(state, 'identifier-collision', 'Тег с таким именем уже существует.')
    }
    if (!this.documents.createTag) return this.rejected(state, 'source-edit-failed', 'Создание тегов недоступно.')
    try {
      const sources = await this.documents.createTag(state.committedSources, { name })
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, sources)
      if (!compilation.model) return this.compileRejected(state)
      if (!Object.hasOwn(compilation.model.$data.specification.tags ?? {}, name)) {
        return this.rejected(state, 'source-edit-failed', 'Не удалось подтвердить создание тега.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(
        state,
        revision,
        sources,
        compilation.model,
        state.manualLayouts,
        describeHistoryCommand(command),
      )
      return { status: 'applied', command: 'tag.create', revision, createdTag: name }
    } catch (error) {
      return { status: 'rejected', revision: state.revision, issues: [sourceFailure(command.type, error)] }
    }
  }

  private async applyPatchRelation(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'relation.patch' }>,
  ): Promise<CommandResult> {
    const located = this.relationLocator(state.lastValidModel?.$data.relations ?? {}, command.input.id)
    if (!located) return this.rejected(state, 'relation-not-found', 'Выбранная связь больше не существует.')
    const patch = command.input.patch
    const title = patch.title?.trim()
    if (patch.title !== undefined && !title) {
      return this.rejected(state, 'invalid-title', 'Название связи не может быть пустым.')
    }
    if (patch.tags?.some(tag => !Object.hasOwn(state.lastValidModel?.$data.specification.tags ?? {}, tag))) {
      return this.rejected(state, 'invalid-tag', 'Выбранный тег отсутствует в спецификации проекта.')
    }
    if (!this.documents.patchRelation) {
      return this.rejected(
        state,
        'relation-patch-source-edit-failed',
        'Document layer не поддерживает изменение связи.',
      )
    }
    try {
      const candidateSources = await this.documents.patchRelation(state.committedSources, {
        id: command.input.id,
        sourceId: located.sourceId,
        targetId: located.targetId,
        occurrence: located.occurrence,
        patch: { ...patch, ...(title !== undefined ? { title } : {}) },
        ...(command.input.documentUri ? { documentUri: command.input.documentUri } : {}),
      })
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)
      if (
        Object.keys(compilation.model.$data.relations).length !==
          Object.keys(state.lastValidModel?.$data.relations ?? {}).length
      ) {
        return this.rejected(
          state,
          'relation-patch-verification-failed',
          'Изменение связи создало неожиданный semantic delta.',
        )
      }
      const updated = this.relationAtOccurrence(
        compilation.model.$data.relations,
        located.sourceId,
        located.targetId,
        located.occurrence,
      )
      if (
        !updated || (title !== undefined && (updated.relation.title ?? '') !== title)
        || (patch.description !== undefined
          && (flattenMarkdownOrString(updated.relation.description) ?? '') !== (patch.description ?? ''))
        || (patch.technology !== undefined && (updated.relation.technology ?? '') !== (patch.technology ?? ''))
        || (patch.tags !== undefined &&
          !equalStringArrays(updated.relation.tags ?? undefined, [...new Set(patch.tags)]))
      ) {
        return this.rejected(
          state,
          'relation-patch-verification-failed',
          'Не удалось подтвердить новые свойства связи.',
        )
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(
        state,
        revision,
        candidateSources,
        compilation.model,
        state.manualLayouts,
        describeHistoryCommand(command),
      )
      return {
        status: 'applied',
        command: 'relation.patch',
        revision,
        updatedRelationId: updated.id,
      }
    } catch (error) {
      return { status: 'rejected', revision: state.revision, issues: [sourceFailure(command.type, error)] }
    }
  }

  private async applyRemoveRelation(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'relation.remove' }>,
  ): Promise<CommandResult> {
    const beforeRelations = state.lastValidModel?.$data.relations ?? {}
    const located = this.relationLocator(beforeRelations, command.input.id)
    if (!located) return this.rejected(state, 'relation-not-found', 'Выбранная связь больше не существует.')
    if (!this.documents.removeRelation) {
      return this.rejected(
        state,
        'relation-remove-source-edit-failed',
        'Document layer не поддерживает удаление связи.',
      )
    }
    const beforeEndpointCount = this.relationsWithEndpoints(beforeRelations, located.sourceId, located.targetId).length
    try {
      const candidateSources = await this.documents.removeRelation(state.committedSources, {
        id: command.input.id,
        sourceId: located.sourceId,
        targetId: located.targetId,
        occurrence: located.occurrence,
        ...(command.input.documentUri ? { documentUri: command.input.documentUri } : {}),
      })
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)
      const afterRelations = compilation.model.$data.relations
      const exactCount = Object.keys(afterRelations).length === Object.keys(beforeRelations).length - 1
      const endpointCount = this.relationsWithEndpoints(afterRelations, located.sourceId, located.targetId).length
      if (!exactCount || endpointCount !== beforeEndpointCount - 1) {
        return this.rejected(
          state,
          'relation-remove-verification-failed',
          'Не удалось подтвердить удаление ровно одной выбранной связи.',
        )
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(
        state,
        revision,
        candidateSources,
        compilation.model,
        state.manualLayouts,
        describeHistoryCommand(command),
      )
      return {
        status: 'applied',
        command: 'relation.remove',
        revision,
        removedRelationId: command.input.id,
      }
    } catch (error) {
      return { status: 'rejected', revision: state.revision, issues: [sourceFailure(command.type, error)] }
    }
  }

  private async applyCreateView(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'view.create' }>,
  ): Promise<CommandResult> {
    if (command.input.viewOf && !state.lastValidModel?.$data.elements[command.input.viewOf]) {
      return this.rejected(state, 'view-scope-not-found', 'Выбранная область вида больше не существует.')
    }
    if (command.input.title !== undefined && !command.input.title.trim()) {
      return this.rejected(state, 'invalid-title', 'Название вида не может быть пустым.')
    }
    const id = (command.input.id ?? allocateViewId(state)) as ViewId
    if (state.lastValidModel?.$data.views[id]) {
      return this.rejected(state, 'view-id-collision', 'ID вида уже занят.')
    }

    try {
      const candidateSources = await this.documents.createView(state.committedSources, {
        id,
        ...(command.input.viewOf ? { viewOf: command.input.viewOf } : {}),
        ...(command.input.title ? { title: command.input.title } : {}),
        ...(command.input.documentUri ? { documentUri: command.input.documentUri } : {}),
      })
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)
      const created = compilation.model.$data.views[id]
      if (!created || created._type !== 'element' || created.viewOf !== command.input.viewOf) {
        return this.rejected(state, 'created-view-not-found', 'Не удалось подтвердить созданный статический вид.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(
        state,
        revision,
        candidateSources,
        compilation.model,
        state.manualLayouts,
        describeHistoryCommand(command),
      )
      return { status: 'applied', command: 'view.create', revision, createdViewId: id }
    } catch (error) {
      return { status: 'rejected', revision: state.revision, issues: [sourceFailure(command.type, error)] }
    }
  }

  private async applyPatchElement(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'element.patch' }>,
  ): Promise<CommandResult> {
    const before = state.lastValidModel?.$data.elements[command.input.id]
    if (!before) return this.rejected(state, 'element-not-found', 'Выбранный элемент больше не существует.')
    if (command.input.patch.title !== undefined && !command.input.patch.title.trim()) {
      return this.rejected(state, 'invalid-title', 'Название элемента не может быть пустым.')
    }
    const availableTags = new Set(Object.keys(state.lastValidModel?.$data.specification.tags ?? {}))
    if (command.input.patch.tags?.some(tag => !availableTags.has(tag))) {
      return this.rejected(state, 'invalid-tag', 'Выбранный тег отсутствует в спецификации проекта.')
    }

    try {
      const candidateSources = await this.documents.patchElement(state.committedSources, command.input)
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)
      const after = compilation.model.$data.elements[command.input.id]
      if (
        !after || after.kind !== (command.input.patch.kind ?? before.kind) ||
        !this.patchMatches(after, command.input.patch)
      ) {
        return this.rejected(state, 'patch-verification-failed', 'Не удалось подтвердить новые свойства элемента.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(
        state,
        revision,
        candidateSources,
        compilation.model,
        state.manualLayouts,
        describeHistoryCommand(command),
      )
      return {
        status: 'applied',
        command: 'element.patch',
        revision,
        updatedElementId: command.input.id,
      }
    } catch (error) {
      return { status: 'rejected', revision: state.revision, issues: [sourceFailure(command.type, error)] }
    }
  }

  private async applyMoveElement(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'element.move' }>,
  ): Promise<CommandResult> {
    const oldIds = subtreeIds(state, command.input.id)
    if (oldIds.length === 0) return this.rejected(state, 'element-not-found', 'Выбранный элемент больше не существует.')
    if (command.input.parentId && !state.lastValidModel?.$data.elements[command.input.parentId]) {
      return this.rejected(state, 'invalid-parent', 'Выбранный родитель больше не существует.')
    }
    if (command.input.parentId === command.input.id || command.input.parentId?.startsWith(`${command.input.id}.`)) {
      return this.rejected(state, 'move-cycle', 'Нельзя переместить элемент внутрь его собственного поддерева.')
    }
    const newRoot = (command.input.parentId
      ? `${command.input.parentId}.${localId(command.input.id)}`
      : localId(command.input.id)) as Fqn
    if (newRoot === command.input.id) {
      return this.rejected(state, 'invalid-parent', 'Элемент уже находится у выбранного родителя.')
    }
    const newIds = mappedSubtree(oldIds, command.input.id, newRoot)
    const oldSet = new Set(oldIds)
    if (newIds.some(id => state.lastValidModel?.$data.elements[id] && !oldSet.has(id))) {
      return this.rejected(state, 'move-collision', 'Перемещение создаёт конфликт идентификаторов.')
    }

    try {
      const candidateSources = await this.documents.moveElement(state.committedSources, command.input)
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)
      if (
        !this.subtreeMutationVerified(
          state.lastValidModel?.$data.elements ?? {},
          compilation.model.$data.elements,
          oldIds,
          newIds,
        )
      ) {
        return this.rejected(state, 'move-verification-failed', 'Не удалось подтвердить перемещение полного поддерева.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(
        state,
        revision,
        candidateSources,
        compilation.model,
        state.manualLayouts,
        describeHistoryCommand(command),
      )
      return { status: 'applied', command: 'element.move', revision, updatedElementId: newRoot }
    } catch (error) {
      return { status: 'rejected', revision: state.revision, issues: [sourceFailure(command.type, error)] }
    }
  }

  private async applyRenameElement(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'element.rename' }>,
  ): Promise<CommandResult> {
    const oldIds = subtreeIds(state, command.input.id)
    if (oldIds.length === 0) return this.rejected(state, 'element-not-found', 'Выбранный элемент больше не существует.')
    const parent = parentId(command.input.id)
    const newRoot = (parent ? `${parent}.${command.input.newId}` : command.input.newId) as Fqn
    const newIds = mappedSubtree(oldIds, command.input.id, newRoot)
    const oldSet = new Set(oldIds)
    if (newIds.some(id => state.lastValidModel?.$data.elements[id] && !oldSet.has(id))) {
      return this.rejected(state, 'rename-collision', 'Переименование создаёт конфликт идентификаторов.')
    }

    try {
      const candidateSources = await this.documents.renameElement(state.committedSources, command.input)
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)
      if (
        !this.subtreeMutationVerified(
          state.lastValidModel?.$data.elements ?? {},
          compilation.model.$data.elements,
          oldIds,
          newIds,
        )
      ) {
        return this.rejected(
          state,
          'rename-verification-failed',
          'Не удалось подтвердить переименование полного поддерева.',
        )
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(
        state,
        revision,
        candidateSources,
        compilation.model,
        state.manualLayouts,
        describeHistoryCommand(command),
      )
      return { status: 'applied', command: 'element.rename', revision, updatedElementId: newRoot }
    } catch (error) {
      return { status: 'rejected', revision: state.revision, issues: [sourceFailure(command.type, error)] }
    }
  }

  private async applyRemovalInspection(id: Fqn, expectedRevision: number): Promise<RemovalInspectionResult> {
    const state = this.current
    if (expectedRevision !== state.revision) return { status: 'conflict', revision: state.revision }
    if (state.compilation.status !== 'valid') {
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [issue('workspace-invalid', 'Изменение отклонено: исправьте ошибки в коде проекта.')],
      }
    }
    if (!state.lastValidModel?.$data.elements[id]) {
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [issue('element-not-found', 'Выбранный элемент больше не существует.')],
      }
    }
    try {
      const report = await this.documents.inspectRemoveElement(state.committedSources, id)
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      if (report.target !== id) {
        return {
          status: 'rejected',
          revision: state.revision,
          issues: [issue('removal-inspection-failed', 'Отчёт об удалении не соответствует выбранному элементу.')],
        }
      }
      return { status: 'ready', revision: state.revision, report }
    } catch (error) {
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [
          sourceFailure('element.remove', error).code === 'remove-source-edit-failed'
            ? issue('removal-inspection-failed', 'Не удалось проверить зависимости элемента.')
            : sourceFailure('element.remove', error),
        ],
      }
    }
  }

  private async applyRemoveElement(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'element.remove' }>,
  ): Promise<CommandResult> {
    const oldIds = subtreeIds(state, command.input.id)
    if (oldIds.length === 0) return this.rejected(state, 'element-not-found', 'Выбранный элемент больше не существует.')
    try {
      const candidateSources = await this.documents.removeElement(state.committedSources, command.input)
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)
      if (oldIds.some(id => compilation.model?.$data.elements[id])) {
        return this.rejected(state, 'remove-verification-failed', 'Удалённое поддерево осталось в модели.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(
        state,
        revision,
        candidateSources,
        compilation.model,
        state.manualLayouts,
        describeHistoryCommand(command),
      )
      return {
        status: 'applied',
        command: 'element.remove',
        revision,
        removedElementId: command.input.id,
      }
    } catch (error) {
      return { status: 'rejected', revision: state.revision, issues: [sourceFailure(command.type, error)] }
    }
  }

  private async applyLayout(state: EditorWorkspaceState, command: LayoutCommand): Promise<CommandResult> {
    const revision = state.revision + 1
    // Geometry does not change sources. The validated model retains canonical
    // automatic views in $data; manual geometry is materialized separately.
    const autoModel = state.lastValidModel
    if (!autoModel) return this.compileRejected(state)
    const viewId = command.input.viewId
    const autoView = autoModel.$data.views[viewId]
    if (!autoView) {
      return this.rejected(state, 'layout-view-not-found', 'Выбранный вид больше не существует.')
    }

    const nextLayouts = cloneLayouts(state.manualLayouts)
    switch (command.type) {
      case 'layout.save': {
        const snapshot = command.input.snapshot
        const parsedSnapshot = parseSnapshot(snapshot)
        if (!parsedSnapshot.ok) {
          return this.rejected(state, 'layout-snapshot-invalid', 'Раскладка имеет некорректную структуру.')
        }
        if (parsedSnapshot.snapshot.id !== viewId) {
          return this.rejected(state, 'layout-view-mismatch', 'Раскладка принадлежит другому виду.')
        }
        if (parsedSnapshot.snapshot._type !== autoView._type) {
          return this.rejected(state, 'layout-type-mismatch', 'Тип раскладки не совпадает с типом вида.')
        }
        nextLayouts[viewId] = reconcileSnapshot(
          autoView,
          parsedSnapshot.snapshot,
          state.manualLayouts[viewId]?.nodes ?? autoView.nodes,
        )
        break
      }
      case 'layout.reset':
        if (!nextLayouts[viewId]) {
          return this.rejected(state, 'layout-not-found', 'Для выбранного вида нет сохранённой ручной раскладки.')
        }
        delete nextLayouts[viewId]
        break
    }

    if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
    this.commitCandidate(
      state,
      revision,
      state.committedSources,
      autoModel,
      nextLayouts,
      describeHistoryCommand(command),
    )
    return { status: 'applied', command: command.type, revision, viewId }
  }

  private async applyUndo(expectedRevision: number): Promise<CommandResult> {
    const state = this.current
    if (expectedRevision !== state.revision) return { status: 'conflict', revision: state.revision }
    const invalid = this.invalidWorkspaceResult(state)
    if (invalid) return invalid
    const previous = state.history.past.at(-1)
    if (!previous) return this.rejected(state, 'history-empty', 'История пуста — отменять нечего.')

    const revision = state.revision + 1
    try {
      const compilation = await this.compileHistory(state, revision, previous.document.sources)
      if (!compilation.model) {
        return this.rejected(
          state,
          'undo-compile-rejected',
          'Не удалось отменить изменение: предыдущая версия не компилируется.',
        )
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.restoreHistory(state, revision, previous.document, compilation.model, {
        past: state.history.past.slice(0, -1),
        future: [
          ...state.history.future,
          historyEntry(state.revision, state.committedSources, state.manualLayouts, state.history.current),
        ],
        current: previous.action,
      })
      return { status: 'applied', command: 'history.undo', revision }
    } catch {
      return this.rejected(
        state,
        'undo-compile-rejected',
        'Не удалось отменить изменение: предыдущая версия не компилируется.',
      )
    }
  }

  private async applyRedo(expectedRevision: number): Promise<CommandResult> {
    const state = this.current
    if (expectedRevision !== state.revision) return { status: 'conflict', revision: state.revision }
    const invalid = this.invalidWorkspaceResult(state)
    if (invalid) return invalid
    const next = state.history.future.at(-1)
    if (!next) return this.rejected(state, 'redo-history-empty', 'Повторять нечего.')

    const revision = state.revision + 1
    try {
      const compilation = await this.compileHistory(state, revision, next.document.sources)
      if (!compilation.model) {
        return this.rejected(state, 'redo-compile-rejected', 'Не удалось повторить изменение: версия не компилируется.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.restoreHistory(state, revision, next.document, compilation.model, {
        past: [
          ...state.history.past,
          historyEntry(state.revision, state.committedSources, state.manualLayouts, state.history.current),
        ],
        future: state.history.future.slice(0, -1),
        current: next.action,
      })
      return { status: 'applied', command: 'history.redo', revision }
    } catch {
      return this.rejected(state, 'redo-compile-rejected', 'Не удалось повторить изменение: версия не компилируется.')
    }
  }

  private async applyHistoryPosition(index: number, expectedRevision: number): Promise<CommandResult> {
    const state = this.current
    if (expectedRevision !== state.revision) return { status: 'conflict', revision: state.revision }
    const invalid = this.invalidWorkspaceResult(state)
    if (invalid) return invalid
    const size = state.history.past.length + state.history.future.length + 1
    if (!Number.isInteger(index) || index < 0 || index >= size) {
      return this.rejected(state, 'history-position-invalid', 'Это состояние больше не доступно в истории.')
    }
    if (index === state.history.past.length) {
      return { status: 'applied', command: 'history.goto', revision: state.revision }
    }
    const timeline = [
      ...state.history.past,
      historyEntry(state.revision, state.committedSources, state.manualLayouts, state.history.current),
      ...state.history.future.toReversed(),
    ]
    const target = timeline[index]!
    const revision = state.revision + 1
    try {
      const compilation = await this.compileHistory(state, revision, target.document.sources)
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      if (!compilation.model) {
        return this.rejected(state, 'history-compile-rejected', 'Не удалось восстановить выбранное состояние.')
      }
      this.restoreHistory(state, revision, target.document, compilation.model, {
        past: timeline.slice(0, index),
        future: timeline.slice(index + 1).toReversed(),
        current: target.action,
      })
      return { status: 'applied', command: 'history.goto', revision }
    } catch {
      return this.rejected(state, 'history-compile-rejected', 'Не удалось восстановить выбранное состояние.')
    }
  }

  private validateCreateKind(state: EditorWorkspaceState, kind: ElementKind): CommandResult | null {
    if (availableKinds(state).has(kind)) return null
    return {
      status: 'rejected',
      revision: state.revision,
      issues: [issue('kind-unavailable', 'Этот тип элемента недоступен в текущей спецификации.')],
    }
  }

  private relationLocator(relations: CompiledRelations, id: RelationId) {
    const entries = Object.entries(relations)
    const index = entries.findIndex(([relationId]) => relationId === id)
    if (index < 0) return null
    const relation = entries[index]![1]
    const sourceId = localEndpoint(relation.source) as Fqn
    const targetId = localEndpoint(relation.target) as Fqn
    const occurrence =
      entries.slice(0, index).filter(([, previous]) =>
        localEndpoint(previous.source) === sourceId && localEndpoint(previous.target) === targetId
      ).length
    return { relation, sourceId, targetId, occurrence }
  }

  private relationsWithEndpoints(relations: CompiledRelations, sourceId: Fqn, targetId: Fqn) {
    return Object.entries(relations).filter(([, relation]) =>
      localEndpoint(relation.source) === sourceId && localEndpoint(relation.target) === targetId
    )
  }

  private relationAtOccurrence(
    relations: CompiledRelations,
    sourceId: Fqn,
    targetId: Fqn,
    occurrence: number,
  ): { id: RelationId; relation: CompiledRelations[RelationId] } | null {
    const match = this.relationsWithEndpoints(relations, sourceId, targetId)[occurrence]
    return match ? { id: match[0] as RelationId, relation: match[1] } : null
  }

  private positionedLayouts(
    state: EditorWorkspaceState,
    autoModel: NonNullable<CompileResult['model']>,
    viewId: ViewId,
    elementId: Fqn,
    position: CanvasPosition,
  ): Record<ViewId, ViewManualLayoutSnapshot> | null {
    const autoView = autoModel.$data.views[viewId]
    if (!autoView || autoView._type !== 'element') return null
    const snapshot = state.manualLayouts[viewId]
      ? mergeManualLayout(autoView, state.manualLayouts[viewId]!)
      : snapshotFromLayout(autoView)

    const created = snapshot.nodes.find(node => node.id === elementId || node.modelRef === elementId)
    if (!created) return null
    const nodes = placeCreatedNode(snapshot.nodes, created.id, position)
    if (!nodes) return null
    const nextLayouts = cloneLayouts(state.manualLayouts)
    nextLayouts[viewId] = reconcileSnapshot(autoView, {
      ...snapshot,
      nodes,
      bounds: boundsFromNodes(nodes),
    }, snapshot.nodes)
    return nextLayouts
  }

  private patchMatches(
    element: NonNullable<CompileResult['model']>['$data']['elements'][Fqn],
    patch: Extract<EditorCommand, { type: 'element.patch' }>['input']['patch'],
  ): boolean {
    if (patch.kind !== undefined && element.kind !== patch.kind) return false
    if (patch.shape !== undefined && element.style.shape !== patch.shape) return false
    if (patch.color !== undefined && element.style.color !== patch.color) return false
    if (patch.title !== undefined && element.title !== patch.title.trim()) return false
    if (
      patch.description !== undefined &&
      flattenMarkdownOrString(element.description) !== flattenMarkdownOrString(patch.description)
    ) return false
    if (patch.technology !== undefined && (element.technology ?? null) !== patch.technology) return false
    if (
      patch.icon !== undefined && (element.style.icon === 'none' ? null : element.style.icon ?? null) !== patch.icon
    ) {
      return false
    }
    if (patch.tags !== undefined && !equalStringArrays(element.tags ?? undefined, [...new Set(patch.tags)])) {
      return false
    }
    return true
  }

  private subtreeMutationVerified(
    beforeElements: CompiledElements,
    afterElements: CompiledElements,
    oldIds: readonly Fqn[],
    newIds: readonly Fqn[],
  ): boolean {
    if (oldIds.length !== newIds.length || new Set(newIds).size !== newIds.length) return false
    return oldIds.every((oldId, index) => {
      const newId = newIds[index]!
      const before = beforeElements[oldId]
      const after = afterElements[newId]
      return !!before
        && !!after
        && before.kind === after.kind
        && (oldId === newId || !afterElements[oldId])
    })
  }

  private isCurrent(state: EditorWorkspaceState): boolean {
    return this.current === state
  }

  private rejected(state: EditorWorkspaceState, code: CommandIssue['code'], message: string): CommandResult {
    return { status: 'rejected', revision: state.revision, issues: [issue(code, message)] }
  }

  private compileRejected(state: EditorWorkspaceState): CommandResult {
    return this.rejected(state, 'compile-rejected', 'Изменение отклонено: исправьте ошибки в коде проекта.')
  }

  private async compileCandidate(revision: number, sources: readonly SourceFile[]): Promise<CompileResult> {
    const compilation = await this.compiler({ revision, sources })
    if (compilation.revision !== revision) {
      return { revision, diagnostics: compilation.diagnostics, model: null }
    }
    return compilation
  }

  /** Geometry-only history reuses the validated semantics; every source change is compiled again. */
  private async compileHistory(
    state: EditorWorkspaceState,
    revision: number,
    sources: readonly SourceFile[],
  ): Promise<CompileResult> {
    const unchanged = sources.length === state.committedSources.length &&
      sources.every((source, index) =>
        source.uri === state.committedSources[index]?.uri && source.content === state.committedSources[index]?.content
      )
    return unchanged && state.lastValidModel
      ? { revision, diagnostics: [], model: state.lastValidModel }
      : this.compileCandidate(revision, sources)
  }

  private restoreHistory(
    state: EditorWorkspaceState,
    revision: number,
    document: WorkspaceDocumentSnapshot,
    autoModel: NonNullable<CompileResult['model']>,
    history: EditorWorkspaceState['history'],
  ): void {
    this.pendingCompileRevision = Math.max(this.pendingCompileRevision, revision)
    const manualLayouts = compatibleLayouts(autoModel, document.manualLayouts)
    const model = materializeModel(autoModel, manualLayouts)
    this.current = {
      ...state,
      revision,
      committedSources: cloneSources(document.sources),
      draftSources: cloneSources(document.sources),
      manualLayouts,
      compilation: { revision, status: 'valid', diagnostics: [], model },
      lastValidModel: model,
      history,
    }
  }

  private commitCandidate(
    state: EditorWorkspaceState,
    revision: number,
    sources: readonly SourceFile[],
    autoModel: NonNullable<CompileResult['model']>,
    manualLayouts: ManualLayouts,
    action: EditorHistoryAction,
  ): void {
    this.pendingCompileRevision = Math.max(this.pendingCompileRevision, revision)
    const layouts = compatibleLayouts(autoModel, manualLayouts)
    const model = materializeModel(autoModel, layouts)
    this.current = {
      ...state,
      revision,
      committedSources: cloneSources(sources),
      draftSources: cloneSources(sources),
      manualLayouts: layouts,
      compilation: { revision, status: 'valid', diagnostics: [], model },
      lastValidModel: model,
      history: {
        past: [
          ...state.history.past,
          historyEntry(state.revision, state.committedSources, state.manualLayouts, state.history.current),
        ],
        future: [],
        current: action,
      },
    }
  }
}

function boundsFromNodes(nodes: readonly { x: number; y: number; width: number; height: number }[]) {
  if (nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const x = Math.min(...nodes.map(node => node.x))
  const y = Math.min(...nodes.map(node => node.y))
  const right = Math.max(...nodes.map(node => node.x + node.width))
  const bottom = Math.max(...nodes.map(node => node.y + node.height))
  return { x, y, width: right - x, height: bottom - y }
}
