import type { ElementKind, Fqn, RelationId } from '@likec4/core/types'
import type {
  CommandIssue,
  CommandResult,
  CompileResult,
  CompilerPort,
  EditorHistoryEntry,
  EditorOperation,
  EditorWorkspaceState,
  ElementEditPort,
  RelationEditPort,
  SourceFile,
} from './contracts'

const supportedKinds = new Set<ElementKind>(['actor', 'system', 'component'] as ElementKind[])

const defaultElementEdit: ElementEditPort = async (sources, input) => {
  const { editElementWithLanguageServices } = await import('./language-services-adapter')
  return editElementWithLanguageServices(sources, input)
}

const defaultRelationEdit: RelationEditPort = async (sources, input) => {
  const { editRelationWithLanguageServices } = await import('./language-services-adapter')
  return editRelationWithLanguageServices(sources, input)
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
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${kind}${suffix}`
    if (!existing.has(candidate)) return candidate
  }
}

function localEndpoint(reference: { readonly model: string; readonly project?: string }): string {
  return reference.project ? `@${reference.project}.${reference.model}` : reference.model
}

export class EditorWorkspace {
  private current: EditorWorkspaceState
  private operationQueue: Promise<void> = Promise.resolve()
  private pendingCompileRevision = 0

  private constructor(
    state: EditorWorkspaceState,
    private readonly compiler: CompilerPort,
    private readonly editElement: ElementEditPort,
    private readonly editRelation: RelationEditPort,
  ) {
    this.current = state
  }

  static async create(
    sources: readonly SourceFile[],
    compiler: CompilerPort,
    editElement: ElementEditPort = defaultElementEdit,
    editRelation: RelationEditPort = defaultRelationEdit,
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
    return new EditorWorkspace(state, compiler, editElement, editRelation)
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

  private enqueue(action: () => Promise<CommandResult>): Promise<CommandResult> {
    let resolveResult!: (result: CommandResult) => void
    const result = new Promise<CommandResult>(resolve => {
      resolveResult = resolve
    })
    this.operationQueue = this.operationQueue.then(async () => {
      resolveResult(await action())
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
    }
  }

  private async applyCreateElement(
    state: EditorWorkspaceState,
    command: Extract<EditorOperation['semantic'], { type: 'element.create' }>,
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
      const candidateSources = await this.editElement(state.committedSources, {
        id,
        kind: command.input.kind,
        ...(command.input.title ? { title: command.input.title } : {}),
        ...(command.input.documentUri ? { documentUri: command.input.documentUri } : {}),
      })
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) {
        return {
          status: 'rejected',
          revision: state.revision,
          issues: [issue('compile-rejected', 'Изменение отклонено: исправьте ошибки в коде проекта.')],
        }
      }
      const createdElementId = id as Fqn
      if (!compilation.model.$data.elements[createdElementId]) {
        return {
          status: 'rejected',
          revision: state.revision,
          issues: [issue('created-element-not-found', 'Созданный элемент отсутствует в скомпилированной модели.')],
        }
      }
      this.commitCandidate(state, revision, candidateSources, compilation.model)
      return { status: 'applied', command: 'element.create', revision, createdElementId }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const collision = message.toLowerCase().includes('collision')
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [issue(
          collision ? 'identifier-collision' : 'source-edit-failed',
          collision
            ? 'Не удалось создать элемент: идентификатор уже занят.'
            : 'Не удалось применить изменение к исходному коду.',
        )],
      }
    }
  }

  private async applyCreateRelation(
    state: EditorWorkspaceState,
    command: Extract<EditorOperation['semantic'], { type: 'relation.create' }>,
  ): Promise<CommandResult> {
    const { sourceId, targetId } = command.input
    const elements = state.lastValidModel?.$data.elements ?? {}
    if (!elements[sourceId]) {
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [issue('source-element-not-found', 'Исходный элемент больше не существует.')],
      }
    }
    if (!elements[targetId]) {
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [issue('target-element-not-found', 'Целевой элемент больше не существует.')],
      }
    }
    if (sourceId === targetId) {
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [issue('same-endpoint', 'Нельзя связать элемент с самим собой.')],
      }
    }

    try {
      const candidateSources = await this.editRelation(state.committedSources, {
        sourceId,
        targetId,
        ...(command.input.documentUri ? { documentUri: command.input.documentUri } : {}),
      })
      const revision = state.revision + 1
      const compilation = await this.compileCandidate(revision, candidateSources)
      if (!compilation.model) {
        return {
          status: 'rejected',
          revision: state.revision,
          issues: [issue('compile-rejected', 'Изменение отклонено: исправьте ошибки в коде проекта.')],
        }
      }

      const previousIds = new Set(Object.keys(state.lastValidModel?.$data.relations ?? {}))
      const added = Object.entries(compilation.model.$data.relations ?? {})
        .filter(([relationId]) => !previousIds.has(relationId))
      if (added.length !== 1) {
        return {
          status: 'rejected',
          revision: state.revision,
          issues: [issue('created-relation-not-found', 'Не удалось однозначно подтвердить созданную связь.')],
        }
      }
      const [createdRelationId, relation] = added[0]!
      if (localEndpoint(relation.source) !== sourceId || localEndpoint(relation.target) !== targetId) {
        return {
          status: 'rejected',
          revision: state.revision,
          issues: [issue('created-relation-not-found', 'Созданная связь не совпадает с выбранным направлением.')],
        }
      }

      this.commitCandidate(state, revision, candidateSources, compilation.model)
      return {
        status: 'applied',
        command: 'relation.create',
        revision,
        createdRelationId: createdRelationId as RelationId,
      }
    } catch (_error) {
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [issue('relation-source-edit-failed', 'Не удалось применить связь к исходному коду.')],
      }
    }
  }

  private async applyUndo(expectedRevision: number): Promise<CommandResult> {
    const state = this.current
    if (expectedRevision !== state.revision) {
      return { status: 'conflict', revision: state.revision }
    }
    const invalid = this.invalidWorkspaceResult(state)
    if (invalid) return invalid
    const previous = state.history.past.at(-1)
    if (!previous) {
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [issue('history-empty', 'История пуста — отменять нечего.')],
      }
    }

    const revision = state.revision + 1
    try {
      const compilation = await this.compileCandidate(revision, previous.sources)
      if (!compilation.model) {
        return {
          status: 'rejected',
          revision: state.revision,
          issues: [issue('undo-compile-rejected', 'Не удалось отменить изменение: предыдущая версия не компилируется.')],
        }
      }
      this.pendingCompileRevision = Math.max(this.pendingCompileRevision, revision)
      this.current = {
        ...state,
        revision,
        committedSources: cloneSources(previous.sources),
        draftSources: cloneSources(previous.sources),
        compilation: {
          revision,
          status: 'valid',
          diagnostics: [],
          model: compilation.model,
        },
        lastValidModel: compilation.model,
        history: {
          past: state.history.past.slice(0, -1),
          future: [...state.history.future, historyEntry(state.revision, state.committedSources)],
        },
      }
      return { status: 'applied', command: 'history.undo', revision }
    } catch (_error) {
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [issue('undo-compile-rejected', 'Не удалось отменить изменение: предыдущая версия не компилируется.')],
      }
    }
  }

  private async compileCandidate(revision: number, sources: readonly SourceFile[]): Promise<CompileResult> {
    const compilation = await this.compiler({ revision, sources })
    if (compilation.revision !== revision) {
      return { revision, diagnostics: compilation.diagnostics, model: null }
    }
    return compilation
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
      compilation: {
        revision,
        status: 'valid',
        diagnostics: [],
        model,
      },
      lastValidModel: model,
      history: {
        past: [...state.history.past, historyEntry(state.revision, state.committedSources)],
        future: [],
      },
    }
  }
}
