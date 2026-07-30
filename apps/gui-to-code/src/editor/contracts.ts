import type { LikeC4Model } from '@likec4/core/model'
import type { ElementKind, Fqn, RelationId } from '@likec4/core/types'

export type Revision = number
export type OperationId = number

export interface SourceFile {
  readonly uri: string
  readonly content: string
}

export interface WorkspaceDiagnostic {
  readonly message: string
  readonly line?: number
}

export interface CompileRequest {
  readonly revision: Revision
  readonly sources: readonly SourceFile[]
}

export interface CompileResult {
  readonly revision: Revision
  readonly diagnostics: readonly WorkspaceDiagnostic[]
  readonly model: LikeC4Model.Layouted | null
}

export type CompilerPort = (request: CompileRequest) => Promise<CompileResult>

export interface CreateElementEditInput {
  readonly kind: ElementKind
  readonly id: string
  readonly title?: string
  readonly documentUri?: string
}

export type ElementEditPort = (
  sources: readonly SourceFile[],
  input: CreateElementEditInput,
) => Promise<readonly SourceFile[]>

export interface CreateRelationEditInput {
  readonly sourceId: Fqn
  readonly targetId: Fqn
  readonly documentUri?: string
}

export type RelationEditPort = (
  sources: readonly SourceFile[],
  input: CreateRelationEditInput,
) => Promise<readonly SourceFile[]>

export interface EditorHistoryEntry {
  readonly revision: Revision
  readonly sources: readonly SourceFile[]
}

export interface EditorHistory {
  readonly past: readonly EditorHistoryEntry[]
  readonly future: readonly EditorHistoryEntry[]
}

export interface WorkspaceCompilation {
  readonly revision: Revision
  readonly status: 'idle' | 'compiling' | 'valid' | 'invalid'
  readonly diagnostics: readonly WorkspaceDiagnostic[]
  readonly model: LikeC4Model.Layouted | null
}

export interface EditorWorkspaceState {
  readonly version: 1
  readonly projectId: string
  readonly revision: Revision
  readonly committedSources: readonly SourceFile[]
  readonly draftSources: readonly SourceFile[]
  readonly compilation: WorkspaceCompilation
  readonly lastValidModel: LikeC4Model.Layouted | null
  readonly history: EditorHistory
}

export interface CreateElementCommand {
  readonly type: 'element.create'
  readonly input: {
    readonly kind: ElementKind
    readonly id?: string
    readonly title?: string
    readonly documentUri?: string
  }
}

export interface CreateRelationCommand {
  readonly type: 'relation.create'
  readonly input: {
    readonly sourceId: Fqn
    readonly targetId: Fqn
    readonly documentUri?: string
  }
}

export type EditorCommand = CreateElementCommand | CreateRelationCommand

export interface EditorOperation {
  readonly id: OperationId
  readonly expectedRevision: Revision
  readonly semantic: EditorCommand
}

export type CommandIssueCode =
  | 'stale-revision'
  | 'workspace-invalid'
  | 'kind-unavailable'
  | 'identifier-collision'
  | 'source-edit-failed'
  | 'compile-rejected'
  | 'created-element-not-found'
  | 'source-element-not-found'
  | 'target-element-not-found'
  | 'same-endpoint'
  | 'relation-not-allowed'
  | 'relation-source-edit-failed'
  | 'created-relation-not-found'
  | 'history-empty'
  | 'undo-compile-rejected'

export interface CommandIssue {
  readonly code: CommandIssueCode
  readonly message: string
}

export type CommandResult =
  | {
    readonly status: 'applied'
    readonly command: 'element.create'
    readonly revision: Revision
    readonly createdElementId: Fqn
  }
  | {
    readonly status: 'applied'
    readonly command: 'relation.create'
    readonly revision: Revision
    readonly createdRelationId: RelationId
  }
  | {
    readonly status: 'applied'
    readonly command: 'history.undo'
    readonly revision: Revision
  }
  | {
    readonly status: 'rejected'
    readonly revision: Revision
    readonly issues: readonly CommandIssue[]
  }
  | {
    readonly status: 'conflict'
    readonly revision: Revision
  }
