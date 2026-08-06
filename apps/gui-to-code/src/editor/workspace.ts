import { LikeC4Model } from '@likec4/core/model'
import type {
  ElementKind,
  Fqn,
  RelationId,
  ViewId,
  ViewManualLayoutSnapshot,
} from '@likec4/core/types'
import type {
  CanvasPosition,
  CommandIssue,
  CommandResult,
  CompileResult,
  CompilerPort,
  EditorCommand,
  EditorDocumentPort,
  EditorHistoryEntry,
  EditorOperation,
  EditorWorkspaceState,
  LayoutCommand,
  RemovalInspectionResult,
  SourceFile,
  WorkspaceDocumentSnapshot,
} from './contracts'
import { EditorDocumentError } from './contracts'
import { applyWp06Command } from './wp06-workspace'

const supportedKinds = new Set<ElementKind>(['actor', 'system', 'component'] as ElementKind[])
type CompiledElements = NonNullable<CompileResult['model']>['$data']['elements']
type CompiledRelations = NonNullable<CompileResult['model']>['$data']['relations']
type ManualLayouts = Readonly<Record<ViewId, ViewManualLayoutSnapshot>>

type MutableSnapshotNode = {
  id: string
  modelRef?: string
  x: number
  y: number
  width: number
  height: number
  children: string[]
  [key: string]: unknown
}
type MutableSnapshotEdge = {
  id: string
  source: string
  target: string
  points: unknown[]
  [key: string]: unknown
}
type MutableSnapshot = {
  _stage: 'layouted'
  _type: 'element' | 'dynamic' | 'deployment'
  id: ViewId
  hash: string
  nodes: MutableSnapshotNode[]
  edges: MutableSnapshotEdge[]
  bounds: { x: number; y: number; width: number; height: number }
  autoLayout: object
  [key: string]: unknown
}

let loadedDefaultPort: EditorDocumentPort | null = null
async function defaultPort(): Promise<EditorDocumentPort> {
  loadedDefaultPort ??= (await import('./language-services-adapter')).languageServicesDocumentPort
  return loadedDefaultPort
}

const defaultDocumentPort: EditorDocumentPort = {
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

function cloneLayouts(layouts: ManualLayouts): Record<ViewId, ViewManualLayoutSnapshot> {
  const result = {} as Record<ViewId, ViewManualLayoutSnapshot>
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
): EditorHistoryEntry {
  return { revision, document: documentSnapshot(sources, manualLayouts) }
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

function allocateViewId(state: EditorWorkspaceState): ViewId {
  const existing = new Set(Object.keys(state.lastValidModel?.$data.views ?? {}))
  if (!existing.has('view')) return 'view' as ViewId
  for (let suffix = 2;; suffix += 1) {
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

function sourceFailure(command: EditorCommand['type'], error: unknown): CommandIssue {
  const documentError = error instanceof EditorDocumentError ? error : null
  const code = documentError?.code
  switch (code) {
    case 'not-found':
      return command === 'view.create'
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
        : issue(command === 'element.patch'
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
          : 'source-edit-failed', 'Исходный код изменился. Повторите действие.')
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

function materializeModel(autoModel: LikeC4Model.Layouted, manualLayouts: ManualLayouts): LikeC4Model.Layouted {
  return LikeC4Model.create({
    ...autoModel.$data,
    manualLayouts: cloneLayouts(manualLayouts),
  })
}

function snapshotShapeIsValid(snapshot: ViewManualLayoutSnapshot): boolean {
  return snapshot._stage === 'layouted'
    && (snapshot._type === 'element' || snapshot._type === 'dynamic' || snapshot._type === 'deployment')
    && typeof snapshot.id === 'string'
    && typeof snapshot.hash === 'string'
    && Array.isArray(snapshot.nodes)
    && Array.isArray(snapshot.edges)
    && typeof snapshot.bounds === 'object'
    && snapshot.bounds !== null
    && typeof snapshot.autoLayout === 'object'
    && snapshot.autoLayout !== null
}

function positionIsValid(position: CanvasPosition): boolean {
  return Number.isFinite(position.x) && Number.isFinite(position.y)
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
  ): Promise<EditorWorkspace> {
    const compilation = await compiler({ revision: 0, sources })
    const layouts = cloneLayouts(manualLayouts)
    const model = compilation.model ? materializeModel(compilation.model, layouts) : null
    const state: EditorWorkspaceState = {
      version: 2,
      projectId,
      revision: 0,
      committedSources: cloneSources(sources),
      draftSources: cloneSources(sources),
      manualLayouts: layouts,
      compilation: {
        revision: 0,
        status: model ? 'valid' : 'invalid',
        diagnostics: compilation.diagnostics,
        model,
      },
      lastValidModel: model,
      history: { past: [], future: [] },
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
    const revision = previous.revision + 1
    const model = materializeModel(result.model, previous.manualLayouts)
    this.current = {
      ...previous,
      revision,
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
          historyEntry(previous.revision, previous.committedSources, previous.manualLayouts),
        ],
        future: [],
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

  inspectElementRemoval(id: Fqn, expectedRevision: number): Promise<RemovalInspectionResult> {
    return this.enqueue(() => this.applyRemovalInspection(id, expectedRevision))
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

    switch (operation.semantic.type) {
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
      case 'deploymentView.create':
      case 'deploymentElement.create':
      case 'deploymentRelation.create':
        return applyWp06Command({
          state,
          command: operation.semantic,
          documents: this.documents,
          compileCandidate: (revision, sources) => this.compileCandidate(revision, sources),
          commitCandidate: (revision, sources, model, layouts) =>
            this.commitCandidate(state, revision, sources, model, layouts),
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

  private async applyCreateElement(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'element.create' }>,
  ): Promise<CommandResult> {
    const invalidKind = this.validateCreateKind(state, command.input.kind)
    if (invalidKind) return invalidKind
    const id = command.input.id ?? allocateId(state, command.input.kind)
    try {
      const candidateSources = await this.documents.createElement(state.committedSources, {
        id,
        kind: command.input.kind,
        ...(command.input.title ? { title: command.input.title } : {}),
        ...(command.input.documentUri ? { documentUri: command.input.documentUri } : {}),
      })
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)
      const createdElementId = id as Fqn
      if (!compilation.model.$data.elements[createdElementId]) {
        return this.rejected(state, 'created-element-not-found', 'Созданный элемент отсутствует в скомпилированной модели.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(state, revision, candidateSources, compilation.model, state.manualLayouts)
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
      return this.rejected(state, 'layout-view-unsupported', 'Создание логического элемента доступно только в статическом виде.')
    }
    const id = command.input.id ?? allocateId(state, command.input.kind)
    try {
      const candidateSources = await this.documents.createElement(state.committedSources, {
        id,
        kind: command.input.kind,
        ...(command.input.title ? { title: command.input.title } : {}),
        ...(command.input.documentUri ? { documentUri: command.input.documentUri } : {}),
      })
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)
      const createdElementId = id as Fqn
      if (!compilation.model.$data.elements[createdElementId]) {
        return this.rejected(state, 'created-element-not-found', 'Созданный элемент отсутствует в скомпилированной модели.')
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
      this.commitCandidate(state, revision, candidateSources, compilation.model, nextLayouts)
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
      return this.rejected(state, 'layout-view-unsupported', 'Создание элемента со связью доступно только в статическом виде.')
    }
    if (!this.documents.createConnectedElement) {
      return this.rejected(state, 'create-connected-source-edit-failed', 'Document layer не поддерживает атомарное создание элемента со связью.')
    }
    const id = command.input.id ?? allocateId(state, command.input.kind)
    const createdElementId = id as Fqn
    try {
      const candidateSources = await this.documents.createConnectedElement(state.committedSources, {
        sourceId: command.input.sourceId,
        kind: command.input.kind,
        id,
        ...(command.input.title ? { title: command.input.title } : {}),
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
        return this.rejected(state, 'create-connected-verification-failed', 'Не удалось подтвердить точный semantic delta создания.')
      }
      const [createdRelationId, relation] = addedRelations[0]!
      if (
        localEndpoint(relation.source) !== command.input.sourceId
        || localEndpoint(relation.target) !== createdElementId
      ) {
        return this.rejected(state, 'create-connected-verification-failed', 'Созданная связь не совпадает с выбранным направлением.')
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
      this.commitCandidate(state, revision, candidateSources, compilation.model, nextLayouts)
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
    if (!elements[sourceId]) return this.rejected(state, 'source-element-not-found', 'Исходный элемент больше не существует.')
    if (!elements[targetId]) return this.rejected(state, 'target-element-not-found', 'Целевой элемент больше не существует.')
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
        return this.rejected(state, 'created-relation-not-found', 'Созданная связь не совпадает с выбранным направлением.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(state, revision, candidateSources, compilation.model, state.manualLayouts)
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

  private async applyPatchRelation(
    state: EditorWorkspaceState,
    command: Extract<EditorCommand, { type: 'relation.patch' }>,
  ): Promise<CommandResult> {
    const located = this.relationLocator(state.lastValidModel?.$data.relations ?? {}, command.input.id)
    if (!located) return this.rejected(state, 'relation-not-found', 'Выбранная связь больше не существует.')
    const title = command.input.patch.title?.trim()
    if (!title) return this.rejected(state, 'invalid-title', 'Название связи не может быть пустым.')
    if (!this.documents.patchRelation) {
      return this.rejected(state, 'relation-patch-source-edit-failed', 'Document layer не поддерживает изменение связи.')
    }
    try {
      const candidateSources = await this.documents.patchRelation(state.committedSources, {
        id: command.input.id,
        sourceId: located.sourceId,
        targetId: located.targetId,
        occurrence: located.occurrence,
        patch: { title },
        ...(command.input.documentUri ? { documentUri: command.input.documentUri } : {}),
      })
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) return this.compileRejected(state)
      if (Object.keys(compilation.model.$data.relations).length !== Object.keys(state.lastValidModel?.$data.relations ?? {}).length) {
        return this.rejected(state, 'relation-patch-verification-failed', 'Изменение связи создало неожиданный semantic delta.')
      }
      const updated = this.relationAtOccurrence(
        compilation.model.$data.relations,
        located.sourceId,
        located.targetId,
        located.occurrence,
      )
      if (!updated || (updated.relation.title ?? '') !== title) {
        return this.rejected(state, 'relation-patch-verification-failed', 'Не удалось подтвердить новое название связи.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(state, revision, candidateSources, compilation.model, state.manualLayouts)
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
      return this.rejected(state, 'relation-remove-source-edit-failed', 'Document layer не поддерживает удаление связи.')
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
        return this.rejected(state, 'relation-remove-verification-failed', 'Не удалось подтвердить удаление ровно одной выбранной связи.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(state, revision, candidateSources, compilation.model, state.manualLayouts)
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
    if (!state.lastValidModel?.$data.elements[command.input.viewOf]) {
      return this.rejected(state, 'view-scope-not-found', 'Выбранная область вида больше не существует.')
    }
    if (command.input.title !== undefined && !command.input.title.trim()) {
      return this.rejected(state, 'invalid-title', 'Название вида не может быть пустым.')
    }
    const id = (command.input.id ?? allocateViewId(state)) as ViewId
    if (state.lastValidModel.$data.views[id]) {
      return this.rejected(state, 'view-id-collision', 'ID вида уже занят.')
    }

    try {
      const candidateSources = await this.documents.createView(state.committedSources, {
        id,
        viewOf: command.input.viewOf,
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
      this.commitCandidate(state, revision, candidateSources, compilation.model, state.manualLayouts)
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
      if (!after || after.kind !== before.kind || !this.patchMatches(after, command.input.patch)) {
        return this.rejected(state, 'patch-verification-failed', 'Не удалось подтвердить новые свойства элемента.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(state, revision, candidateSources, compilation.model, state.manualLayouts)
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
      if (!this.subtreeMutationVerified(
        state.lastValidModel?.$data.elements ?? {},
        compilation.model.$data.elements,
        oldIds,
        newIds,
      )) {
        return this.rejected(state, 'move-verification-failed', 'Не удалось подтвердить перемещение полного поддерева.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(state, revision, candidateSources, compilation.model, state.manualLayouts)
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
      if (!this.subtreeMutationVerified(
        state.lastValidModel?.$data.elements ?? {},
        compilation.model.$data.elements,
        oldIds,
        newIds,
      )) {
        return this.rejected(state, 'rename-verification-failed', 'Не удалось подтвердить переименование полного поддерева.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(state, revision, candidateSources, compilation.model, state.manualLayouts)
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
        issues: [sourceFailure('element.remove', error).code === 'remove-source-edit-failed'
          ? issue('removal-inspection-failed', 'Не удалось проверить зависимости элемента.')
          : sourceFailure('element.remove', error)],
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
      this.commitCandidate(state, revision, candidateSources, compilation.model, state.manualLayouts)
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
    const compilation = await this.compileCandidate(revision, state.committedSources)
    if (!compilation.model) return this.compileRejected(state)
    const viewId = command.input.viewId
    const autoView = compilation.model.$data.views[viewId]
    if (!autoView) {
      return this.rejected(state, 'layout-view-not-found', 'Выбранный вид больше не существует.')
    }

    const nextLayouts = cloneLayouts(state.manualLayouts)
    switch (command.type) {
      case 'layout.save': {
        const snapshot = command.input.snapshot
        if (!snapshotShapeIsValid(snapshot)) {
          return this.rejected(state, 'layout-snapshot-invalid', 'Раскладка имеет некорректную структуру.')
        }
        if (snapshot.id !== viewId) {
          return this.rejected(state, 'layout-view-mismatch', 'Раскладка принадлежит другому виду.')
        }
        if (snapshot._type !== autoView._type) {
          return this.rejected(state, 'layout-type-mismatch', 'Тип раскладки не совпадает с типом вида.')
        }
        nextLayouts[viewId] = structuredClone(snapshot)
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
    this.commitCandidate(state, revision, state.committedSources, compilation.model, nextLayouts)
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
      const compilation = await this.compileCandidate(revision, previous.document.sources)
      if (!compilation.model) {
        return this.rejected(state, 'undo-compile-rejected', 'Не удалось отменить изменение: предыдущая версия не компилируется.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.restoreHistory(state, revision, previous.document, compilation.model, {
        past: state.history.past.slice(0, -1),
        future: [
          ...state.history.future,
          historyEntry(state.revision, state.committedSources, state.manualLayouts),
        ],
      })
      return { status: 'applied', command: 'history.undo', revision }
    } catch (_error) {
      return this.rejected(state, 'undo-compile-rejected', 'Не удалось отменить изменение: предыдущая версия не компилируется.')
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
      const compilation = await this.compileCandidate(revision, next.document.sources)
      if (!compilation.model) {
        return this.rejected(state, 'redo-compile-rejected', 'Не удалось повторить изменение: версия не компилируется.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.restoreHistory(state, revision, next.document, compilation.model, {
        past: [
          ...state.history.past,
          historyEntry(state.revision, state.committedSources, state.manualLayouts),
        ],
        future: state.history.future.slice(0, -1),
      })
      return { status: 'applied', command: 'history.redo', revision }
    } catch (_error) {
      return this.rejected(state, 'redo-compile-rejected', 'Не удалось повторить изменение: версия не компилируется.')
    }
  }

  private validateCreateKind(state: EditorWorkspaceState, kind: ElementKind): CommandResult | null {
    if (supportedKinds.has(kind) && availableKinds(state).has(kind)) return null
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
    const occurrence = entries.slice(0, index).filter(([, previous]) =>
      localEndpoint(previous.source) === sourceId && localEndpoint(previous.target) === targetId).length
    return { relation, sourceId, targetId, occurrence }
  }

  private relationsWithEndpoints(relations: CompiledRelations, sourceId: Fqn, targetId: Fqn) {
    return Object.entries(relations).filter(([, relation]) =>
      localEndpoint(relation.source) === sourceId && localEndpoint(relation.target) === targetId)
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
    const snapshot = structuredClone(autoView) as unknown as MutableSnapshot
    const previous = state.manualLayouts[viewId] as unknown as MutableSnapshot | undefined
    const previousNodes = new Map(previous?.nodes.map(node => [node.id, node]) ?? [])
    const previousEdges = new Map(previous?.edges.map(edge => [edge.id, edge]) ?? [])

    snapshot.nodes = snapshot.nodes.map(node => {
      const persisted = previousNodes.get(node.id)
      if (!persisted) return node
      return {
        ...node,
        x: persisted.x,
        y: persisted.y,
        width: persisted.width,
        height: persisted.height,
        children: [...node.children],
      }
    })
    snapshot.edges = snapshot.edges.map(edge => previousEdges.get(edge.id)
      ? structuredClone(previousEdges.get(edge.id)!)
      : edge)

    const created = snapshot.nodes.find(node => node.id === elementId || node.modelRef === elementId)
    if (!created) return null
    created.x = position.x
    created.y = position.y
    snapshot.bounds = boundsFromNodes(snapshot.nodes)

    const nextLayouts = cloneLayouts(state.manualLayouts)
    nextLayouts[viewId] = snapshot as unknown as ViewManualLayoutSnapshot
    return nextLayouts
  }

  private patchMatches(
    element: NonNullable<CompileResult['model']>['$data']['elements'][Fqn],
    patch: Extract<EditorCommand, { type: 'element.patch' }>['input']['patch'],
  ): boolean {
    if (patch.title !== undefined && element.title !== patch.title.trim()) return false
    if (patch.description !== undefined && (element.description ?? null) !== patch.description) return false
    if (patch.technology !== undefined && (element.technology ?? null) !== patch.technology) return false
    if (patch.tags !== undefined && !equalStringArrays(element.tags ?? undefined, [...new Set(patch.tags)])) return false
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

  private restoreHistory(
    state: EditorWorkspaceState,
    revision: number,
    document: WorkspaceDocumentSnapshot,
    autoModel: NonNullable<CompileResult['model']>,
    history: EditorWorkspaceState['history'],
  ): void {
    this.pendingCompileRevision = Math.max(this.pendingCompileRevision, revision)
    const manualLayouts = cloneLayouts(document.manualLayouts)
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
  ): void {
    this.pendingCompileRevision = Math.max(this.pendingCompileRevision, revision)
    const layouts = cloneLayouts(manualLayouts)
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
          historyEntry(state.revision, state.committedSources, state.manualLayouts),
        ],
        future: [],
      },
    }
  }
}

function boundsFromNodes(nodes: readonly MutableSnapshotNode[]) {
  if (nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const x = Math.min(...nodes.map(node => node.x))
  const y = Math.min(...nodes.map(node => node.y))
  const right = Math.max(...nodes.map(node => node.x + node.width))
  const bottom = Math.max(...nodes.map(node => node.y + node.height))
  return { x, y, width: right - x, height: bottom - y }
}
