import type { ElementKind, Fqn, RelationId } from '@likec4/core/types'
import type {
  CommandIssue,
  CommandResult,
  CompileResult,
  CompilerPort,
  EditorCommand,
  EditorDocumentPort,
  EditorHistoryEntry,
  EditorOperation,
  EditorWorkspaceState,
  RemovalInspectionResult,
  SourceFile,
} from './contracts'
import { EditorDocumentError } from './contracts'

const supportedKinds = new Set<ElementKind>(['actor', 'system', 'component'] as ElementKind[])
type CompiledElements = NonNullable<CompileResult['model']>['$data']['elements']

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
  async patchElement(sources, input) {
    return (await defaultPort()).patchElement(sources, input)
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

function historyEntry(revision: number, sources: readonly SourceFile[]): EditorHistoryEntry {
  return { revision, sources: cloneSources(sources) }
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
      return issue('element-not-found', 'Выбранный элемент больше не существует.')
    case 'invalid-title':
      return issue('invalid-title', 'Название элемента не может быть пустым.')
    case 'invalid-tag':
      return issue('invalid-tag', 'Выбранный тег отсутствует в спецификации проекта.')
    case 'invalid-parent':
      return issue('invalid-parent', 'Выбранный родитель недоступен.')
    case 'move-cycle':
      return issue('move-cycle', 'Нельзя переместить элемент внутрь его собственного поддерева.')
    case 'invalid-identifier':
      return issue('invalid-identifier', 'Локальный ID должен быть корректным идентификатором LikeC4.')
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
          : 'source-edit-failed',
        'Не удалось применить изменение к исходному коду.',
      )
  }
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
  ): Promise<EditorWorkspace> {
    const compilation = await compiler({ revision: 0, sources })
    const state: EditorWorkspaceState = {
      version: 1,
      projectId,
      revision: 0,
      committedSources: cloneSources(sources),
      draftSources: cloneSources(sources),
      compilation: {
        revision: 0,
        status: compilation.model ? 'valid' : 'invalid',
        diagnostics: compilation.diagnostics,
        model: compilation.model,
      },
      lastValidModel: compilation.model,
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
    this.current = {
      ...previous,
      revision,
      committedSources: cloneSources(sources),
      draftSources: cloneSources(sources),
      compilation: {
        revision,
        status: 'valid',
        diagnostics: [],
        model: result.model,
      },
      lastValidModel: result.model,
      history: {
        past: [...previous.history.past, historyEntry(previous.revision, previous.committedSources)],
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

    switch (operation.semantic.type) {
      case 'element.create':
        return this.applyCreateElement(state, operation.semantic)
      case 'relation.create':
        return this.applyCreateRelation(state, operation.semantic)
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
    if (!supportedKinds.has(command.input.kind) || !availableKinds(state).has(command.input.kind)) {
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [issue('kind-unavailable', 'Этот тип элемента недоступен в текущей спецификации.')],
      }
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
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.commitCandidate(state, revision, candidateSources, compilation.model)
      return { status: 'applied', command: 'element.create', revision, createdElementId }
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
      this.commitCandidate(state, revision, candidateSources, compilation.model)
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
      this.commitCandidate(state, revision, candidateSources, compilation.model)
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
      this.commitCandidate(state, revision, candidateSources, compilation.model)
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
      this.commitCandidate(state, revision, candidateSources, compilation.model)
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
      this.commitCandidate(state, revision, candidateSources, compilation.model)
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

  private async applyUndo(expectedRevision: number): Promise<CommandResult> {
    const state = this.current
    if (expectedRevision !== state.revision) return { status: 'conflict', revision: state.revision }
    const invalid = this.invalidWorkspaceResult(state)
    if (invalid) return invalid
    const previous = state.history.past.at(-1)
    if (!previous) return this.rejected(state, 'history-empty', 'История пуста — отменять нечего.')

    const revision = state.revision + 1
    try {
      const compilation = await this.compileCandidate(revision, previous.sources)
      if (!compilation.model) {
        return this.rejected(state, 'undo-compile-rejected', 'Не удалось отменить изменение: предыдущая версия не компилируется.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.restoreHistory(state, revision, previous.sources, compilation.model, {
        past: state.history.past.slice(0, -1),
        future: [...state.history.future, historyEntry(state.revision, state.committedSources)],
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
      const compilation = await this.compileCandidate(revision, next.sources)
      if (!compilation.model) {
        return this.rejected(state, 'redo-compile-rejected', 'Не удалось повторить изменение: версия не компилируется.')
      }
      if (!this.isCurrent(state)) return { status: 'conflict', revision: this.current.revision }
      this.restoreHistory(state, revision, next.sources, compilation.model, {
        past: [...state.history.past, historyEntry(state.revision, state.committedSources)],
        future: state.history.future.slice(0, -1),
      })
      return { status: 'applied', command: 'history.redo', revision }
    } catch (_error) {
      return this.rejected(state, 'redo-compile-rejected', 'Не удалось повторить изменение: версия не компилируется.')
    }
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
    sources: readonly SourceFile[],
    model: NonNullable<CompileResult['model']>,
    history: EditorWorkspaceState['history'],
  ): void {
    this.pendingCompileRevision = Math.max(this.pendingCompileRevision, revision)
    this.current = {
      ...state,
      revision,
      committedSources: cloneSources(sources),
      draftSources: cloneSources(sources),
      compilation: { revision, status: 'valid', diagnostics: [], model },
      lastValidModel: model,
      history,
    }
  }

  private commitCandidate(
    state: EditorWorkspaceState,
    revision: number,
    sources: readonly SourceFile[],
    model: NonNullable<CompileResult['model']>,
  ): void {
    this.pendingCompileRevision = Math.max(this.pendingCompileRevision, revision)
    this.current = {
      ...state,
      revision,
      committedSources: cloneSources(sources),
      draftSources: cloneSources(sources),
      compilation: { revision, status: 'valid', diagnostics: [], model },
      lastValidModel: model,
      history: {
        past: [...state.history.past, historyEntry(state.revision, state.committedSources)],
        future: [],
      },
    }
  }
}
