import type { LikeC4Model } from '@likec4/core/model'
import type {
  ElementKind,
  Fqn,
  RelationId,
  ViewId,
  ViewManualLayoutSnapshot,
} from '@likec4/core/types'

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

export interface CreateRelationEditInput {
  readonly sourceId: Fqn
  readonly targetId: Fqn
  readonly documentUri?: string
}

export interface CreateViewEditInput {
  readonly id: string
  readonly viewOf: Fqn
  readonly title?: string
  readonly documentUri?: string
}

export interface CreateDynamicViewEditInput {
  readonly id: string
  readonly title?: string
  readonly documentUri?: string
}

export interface CreateDynamicStepEditInput {
  readonly viewId: ViewId
  readonly sourceId: Fqn
  readonly targetId: Fqn
  readonly documentUri?: string
}

export interface CreateDeploymentViewEditInput {
  readonly id: string
  readonly title?: string
  readonly documentUri?: string
}

export interface CreateDeploymentNodeEditInput {
  readonly family: 'node'
  readonly id: string
  readonly kind: string
  readonly title?: string
  readonly documentUri?: string
}

export interface CreateDeploymentInstanceEditInput {
  readonly family: 'instance'
  readonly id: string
  readonly target: Fqn
  readonly documentUri?: string
}

export type CreateDeploymentElementEditInput = CreateDeploymentNodeEditInput | CreateDeploymentInstanceEditInput

export interface CreateDeploymentRelationEditInput {
  readonly sourceId: Fqn
  readonly targetId: Fqn
  readonly documentUri?: string
}

export interface ElementPatch {
  readonly title?: string
  readonly description?: string | null
  readonly technology?: string | null
  readonly tags?: readonly string[]
}

export interface PatchElementEditInput {
  readonly id: Fqn
  readonly patch: ElementPatch
}

export interface MoveElementEditInput {
  readonly id: Fqn
  readonly parentId: Fqn | null
}

export interface RenameElementEditInput {
  readonly id: Fqn
  readonly newId: string
}

export interface RemoveElementEditInput {
  readonly id: Fqn
  readonly dependencyRevision: string
  readonly approvedDependencyIds: readonly string[]
}

export type RemovalDependencyKind =
  | 'child-element'
  | 'incoming-relation'
  | 'outgoing-relation'
  | 'scoped-view'
  | 'view-reference'
  | 'semantic-reference'

export interface RemovalDependency {
  readonly id: string
  readonly kind: RemovalDependencyKind
  readonly uri: string
  readonly range: {
    readonly start: { readonly line: number; readonly character: number }
    readonly end: { readonly line: number; readonly character: number }
  }
  readonly removal: 'contained' | 'separate' | 'unsupported'
}

export interface RemovalDependencyReport {
  readonly target: Fqn
  readonly revision: string
  readonly dependencies: readonly RemovalDependency[]
}

export type EditorDocumentErrorCode =
  | 'ambiguous-reference'
  | 'collision'
  | 'dependencies-not-approved'
  | 'invalid-identifier'
  | 'invalid-operation'
  | 'invalid-parent'
  | 'invalid-tag'
  | 'invalid-title'
  | 'move-cycle'
  | 'not-found'
  | 'stale-document'
  | 'unsupported-cascade'
  | 'unsupported-reference'
  | 'unknown'

export class EditorDocumentError extends Error {
  constructor(
    readonly code: EditorDocumentErrorCode,
    message: string,
    readonly report?: RemovalDependencyReport,
  ) {
    super(message)
    this.name = 'EditorDocumentError'
  }
}

export interface EditorDocumentPort {
  createElement(sources: readonly SourceFile[], input: CreateElementEditInput): Promise<readonly SourceFile[]>
  createRelation(sources: readonly SourceFile[], input: CreateRelationEditInput): Promise<readonly SourceFile[]>
  createView(sources: readonly SourceFile[], input: CreateViewEditInput): Promise<readonly SourceFile[]>
  createDynamicView(sources: readonly SourceFile[], input: CreateDynamicViewEditInput): Promise<readonly SourceFile[]>
  createDynamicStep(sources: readonly SourceFile[], input: CreateDynamicStepEditInput): Promise<readonly SourceFile[]>
  createDeploymentView(sources: readonly SourceFile[], input: CreateDeploymentViewEditInput): Promise<readonly SourceFile[]>
  createDeploymentNode(sources: readonly SourceFile[], input: CreateDeploymentNodeEditInput): Promise<readonly SourceFile[]>
  createDeploymentInstance(sources: readonly SourceFile[], input: CreateDeploymentInstanceEditInput): Promise<readonly SourceFile[]>
  createDeploymentRelation(sources: readonly SourceFile[], input: CreateDeploymentRelationEditInput): Promise<readonly SourceFile[]>
  patchElement(sources: readonly SourceFile[], input: PatchElementEditInput): Promise<readonly SourceFile[]>
  moveElement(sources: readonly SourceFile[], input: MoveElementEditInput): Promise<readonly SourceFile[]>
  renameElement(sources: readonly SourceFile[], input: RenameElementEditInput): Promise<readonly SourceFile[]>
  inspectRemoveElement(sources: readonly SourceFile[], id: Fqn): Promise<RemovalDependencyReport>
  removeElement(sources: readonly SourceFile[], input: RemoveElementEditInput): Promise<readonly SourceFile[]>
}

export interface WorkspaceDocumentSnapshot {
  readonly sources: readonly SourceFile[]
  readonly manualLayouts: Readonly<Record<ViewId, ViewManualLayoutSnapshot>>
}

export interface EditorHistoryEntry {
  readonly revision: Revision
  readonly document: WorkspaceDocumentSnapshot
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
  readonly version: 2
  readonly projectId: string
  readonly revision: Revision
  readonly committedSources: readonly SourceFile[]
  readonly draftSources: readonly SourceFile[]
  readonly manualLayouts: Readonly<Record<ViewId, ViewManualLayoutSnapshot>>
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

export interface CreateViewCommand {
  readonly type: 'view.create'
  readonly input: {
    readonly id?: string
    readonly title?: string
    readonly viewOf: Fqn
    readonly documentUri?: string
  }
}

export interface PatchElementCommand {
  readonly type: 'element.patch'
  readonly input: {
    readonly id: Fqn
    readonly patch: ElementPatch
  }
}

export interface MoveElementCommand {
  readonly type: 'element.move'
  readonly input: {
    readonly id: Fqn
    readonly parentId: Fqn | null
  }
}

export interface RenameElementCommand {
  readonly type: 'element.rename'
  readonly input: {
    readonly id: Fqn
    readonly newId: string
  }
}

export interface RemoveElementCommand {
  readonly type: 'element.remove'
  readonly input: RemoveElementEditInput
}

export interface CreateDynamicViewCommand {
  readonly type: 'dynamicView.create'
  readonly input: CreateDynamicViewEditInput
}

export interface CreateDynamicStepCommand {
  readonly type: 'dynamicStep.create'
  readonly input: CreateDynamicStepEditInput
}

export interface CreateDeploymentViewCommand {
  readonly type: 'deploymentView.create'
  readonly input: CreateDeploymentViewEditInput
}

export interface CreateDeploymentElementCommand {
  readonly type: 'deploymentElement.create'
  readonly input: CreateDeploymentElementEditInput
}

export interface CreateDeploymentRelationCommand {
  readonly type: 'deploymentRelation.create'
  readonly input: CreateDeploymentRelationEditInput
}

export type EditorCommand =
  | CreateElementCommand
  | CreateRelationCommand
  | CreateViewCommand
  | CreateDynamicViewCommand
  | CreateDynamicStepCommand
  | CreateDeploymentViewCommand
  | CreateDeploymentElementCommand
  | CreateDeploymentRelationCommand
  | PatchElementCommand
  | MoveElementCommand
  | RenameElementCommand
  | RemoveElementCommand

export type LayoutCommand =
  | {
    readonly type: 'layout.save'
    readonly input: {
      readonly viewId: ViewId
      readonly snapshot: ViewManualLayoutSnapshot
    }
  }
  | {
    readonly type: 'layout.reset'
    readonly input: {
      readonly viewId: ViewId
    }
  }

export type EditorOperation =
  | {
    readonly id: OperationId
    readonly expectedRevision: Revision
    readonly semantic: EditorCommand
    readonly layout?: never
  }
  | {
    readonly id: OperationId
    readonly expectedRevision: Revision
    readonly semantic?: never
    readonly layout: LayoutCommand
  }
  | {
    readonly id: OperationId
    readonly expectedRevision: Revision
    readonly semantic: EditorCommand
    readonly layout: LayoutCommand
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
  | 'element-not-found'
  | 'invalid-title'
  | 'invalid-tag'
  | 'patch-source-edit-failed'
  | 'patch-verification-failed'
  | 'invalid-parent'
  | 'move-cycle'
  | 'move-collision'
  | 'move-source-edit-failed'
  | 'move-verification-failed'
  | 'invalid-identifier'
  | 'rename-collision'
  | 'rename-source-edit-failed'
  | 'rename-verification-failed'
  | 'unsupported-reference'
  | 'removal-inspection-failed'
  | 'removal-report-stale'
  | 'removal-approval-mismatch'
  | 'removal-unsupported'
  | 'remove-source-edit-failed'
  | 'remove-verification-failed'
  | 'redo-history-empty'
  | 'redo-compile-rejected'
  | 'view-scope-not-found'
  | 'view-id-collision'
  | 'view-source-edit-failed'
  | 'created-view-not-found'
  | 'layout-view-not-found'
  | 'layout-snapshot-invalid'
  | 'layout-view-mismatch'
  | 'layout-type-mismatch'
  | 'layout-not-found'
  | 'dynamic-view-not-found'
  | 'dynamic-view-verification-failed'
  | 'dynamic-step-verification-failed'
  | 'deployment-kind-unsupported'
  | 'deployment-id-collision'
  | 'deployment-view-verification-failed'
  | 'deployment-element-verification-failed'
  | 'deployment-relation-verification-failed'
  | 'semantic-endpoint-not-found'
  | 'semantic-reference-not-found'
  | 'semantic-operation-invalid'
  | 'ambiguous-target-document'
  | 'stale-source-edit'
  | 'wp06-source-edit-failed'
  | 'combined-operation-unsupported'

export interface CommandIssue {
  readonly code: CommandIssueCode
  readonly message: string
}

export type AppliedCommandResult =
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
    readonly command: 'view.create'
    readonly revision: Revision
    readonly createdViewId: ViewId
  }
  | {
    readonly status: 'applied'
    readonly command: 'element.patch'
    readonly revision: Revision
    readonly updatedElementId: Fqn
  }
  | {
    readonly status: 'applied'
    readonly command: 'element.move' | 'element.rename'
    readonly revision: Revision
    readonly updatedElementId: Fqn
  }
  | {
    readonly status: 'applied'
    readonly command: 'element.remove'
    readonly revision: Revision
    readonly removedElementId: Fqn
  }
  | {
    readonly status: 'applied'
    readonly command: 'dynamicView.create' | 'deploymentView.create'
    readonly revision: Revision
    readonly createdViewId: ViewId
  }
  | {
    readonly status: 'applied'
    readonly command: 'dynamicStep.create'
    readonly revision: Revision
    readonly createdStepId: string
    readonly viewId: ViewId
  }
  | {
    readonly status: 'applied'
    readonly command: 'deploymentElement.create'
    readonly revision: Revision
    readonly createdDeploymentId: Fqn
  }
  | {
    readonly status: 'applied'
    readonly command: 'deploymentRelation.create'
    readonly revision: Revision
    readonly createdRelationId: RelationId
  }
  | {
    readonly status: 'applied'
    readonly command: 'layout.save' | 'layout.reset'
    readonly revision: Revision
    readonly viewId: ViewId
  }
  | {
    readonly status: 'applied'
    readonly command: 'history.undo' | 'history.redo'
    readonly revision: Revision
  }

export type CommandResult =
  | AppliedCommandResult
  | {
    readonly status: 'rejected'
    readonly revision: Revision
    readonly issues: readonly CommandIssue[]
  }
  | {
    readonly status: 'conflict'
    readonly revision: Revision
  }

export type RemovalInspectionResult =
  | {
    readonly status: 'ready'
    readonly revision: Revision
    readonly report: RemovalDependencyReport
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
