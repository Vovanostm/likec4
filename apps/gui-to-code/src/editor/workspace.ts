import type { ElementKind, Fqn } from '@likec4/core/types'
import {
  applyDocumentTextEdits,
  createDocumentEditService,
  fromSources,
} from '@likec4/language-services/browser'
import type {
  CommandIssue,
  CommandResult,
  CompilerPort,
  EditorOperation,
  EditorWorkspaceState,
  SourceFile,
} from './contracts'

const supportedKinds = new Set<ElementKind>(['actor', 'system', 'component'] as ElementKind[])

function cloneSources(sources: readonly SourceFile[]): SourceFile[] {
  return sources.map(source => ({ ...source }))
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

export class EditorWorkspace {
  private current: EditorWorkspaceState
  private operationQueue: Promise<void> = Promise.resolve()
  private pendingCompileRevision = 0

  private constructor(
    state: EditorWorkspaceState,
    private readonly compiler: CompilerPort,
  ) {
    this.current = state
  }

  static async create(
    sources: readonly SourceFile[],
    compiler: CompilerPort,
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
    return new EditorWorkspace(state, compiler)
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
        past: [...previous.history.past, { revision: previous.revision, sources: cloneSources(previous.committedSources) }],
        future: [],
      },
    }
  }

  dispatch(operation: EditorOperation): Promise<CommandResult> {
    let resolveResult!: (result: CommandResult) => void
    const result = new Promise<CommandResult>(resolve => {
      resolveResult = resolve
    })
    this.operationQueue = this.operationQueue.then(async () => {
      resolveResult(await this.applyOperation(operation))
    })
    return result
  }

  private async applyOperation(operation: EditorOperation): Promise<CommandResult> {
    const state = this.current
    if (operation.expectedRevision !== state.revision) {
      return { status: 'conflict', revision: state.revision }
    }
    if (state.compilation.status !== 'valid') {
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [issue('workspace-invalid', 'Изменение отклонено: исправьте ошибки в коде проекта.')],
      }
    }
    const command = operation.semantic
    if (!supportedKinds.has(command.input.kind) || !availableKinds(state).has(command.input.kind)) {
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [issue('kind-unavailable', 'Этот тип элемента недоступен в текущей спецификации.')],
      }
    }
    const source = state.committedSources.find(candidate => candidate.uri === (command.input.documentUri ?? 'model.c4'))
      ?? state.committedSources[0]
    if (!source) {
      return {
        status: 'rejected',
        revision: state.revision,
        issues: [issue('source-edit-failed', 'Не удалось найти исходный документ проекта.')],
      }
    }
    const id = command.input.id ?? allocateId(state, command.input.kind)
    try {
      const likec4 = await fromSources(Object.fromEntries(state.committedSources.map(item => [item.uri, item.content])))
      const plan = await createDocumentEditService(likec4).planAddElement({
        id,
        kind: command.input.kind,
        ...(command.input.title ? { title: command.input.title } : {}),
      })
      const candidateSources = state.committedSources.map(item => {
        const edits = plan.edits.filter(edit => edit.uri === item.uri)
        return edits.length === 0
          ? item
          : {
            ...item,
            content: applyDocumentTextEdits(item.content, edits, plan.baseRevisions[item.uri]!),
          }
      })
      const revision = state.revision + 1
      const compilation = await this.compiler({ revision, sources: candidateSources })
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
      this.pendingCompileRevision = Math.max(this.pendingCompileRevision, revision)
      this.current = {
        ...state,
        revision,
        committedSources: cloneSources(candidateSources),
        draftSources: cloneSources(candidateSources),
        compilation: {
          revision,
          status: 'valid',
          diagnostics: [],
          model: compilation.model,
        },
        lastValidModel: compilation.model,
        history: {
          past: [...state.history.past, { revision: state.revision, sources: cloneSources(state.committedSources) }],
          future: [],
        },
      }
      return { status: 'applied', revision, createdElementId }
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
}
