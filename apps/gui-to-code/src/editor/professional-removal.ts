import type { Fqn } from '@likec4/core/types'
import type { EditorWorkspaceState, RemovalDependencyReport } from './contracts'

export interface MultiRemovalInspection {
  readonly revision: number
  readonly roots: readonly Fqn[]
  readonly reports: readonly RemovalDependencyReport[]
}

export type ProfessionalRemovalIssueCode =
  | 'removal-empty'
  | 'removal-element-missing'
  | 'removal-inspection-failed'
  | 'removal-unsupported'
  | 'removal-source-edit-failed'
  | 'removal-compile-rejected'
  | 'removal-verification-failed'
  | 'workspace-invalid'

export interface ProfessionalRemovalIssue {
  readonly code: ProfessionalRemovalIssueCode
  readonly message: string
}

export type MultiRemovalInspectionResult =
  | {
    readonly status: 'ready'
    readonly revision: number
    readonly inspection: MultiRemovalInspection
  }
  | {
    readonly status: 'rejected'
    readonly revision: number
    readonly issues: readonly ProfessionalRemovalIssue[]
  }
  | {
    readonly status: 'conflict'
    readonly revision: number
  }

export type RemoveSubgraphResult =
  | {
    readonly status: 'applied'
    readonly command: 'subgraph.remove'
    readonly revision: number
    readonly removedElementIds: readonly Fqn[]
  }
  | {
    readonly status: 'rejected'
    readonly revision: number
    readonly issues: readonly ProfessionalRemovalIssue[]
  }
  | {
    readonly status: 'conflict'
    readonly revision: number
  }

/**
 * Keep only independent roots. If both a parent and its descendant are selected,
 * the parent source edit already owns the whole subtree and the child is redundant.
 */
export function normalizeRemovalRoots(ids: Iterable<Fqn>): readonly Fqn[] {
  const unique = [...new Set(ids)].sort((left, right) =>
    left.split('.').length - right.split('.').length || left.localeCompare(right))
  return unique.filter(id => !unique.some(other => other !== id && id.startsWith(`${other}.`)))
}

export function removalElementIds(
  state: EditorWorkspaceState,
  roots: readonly Fqn[],
): readonly Fqn[] {
  const elements = Object.keys(state.lastValidModel?.$data.elements ?? {})
  return elements
    .filter(id => roots.some(root => id === root || id.startsWith(`${root}.`)))
    .sort()
    .map(id => id as Fqn)
}

export function inspectionHasUnsupportedDependencies(inspection: MultiRemovalInspection): boolean {
  return inspection.reports.some(report =>
    report.dependencies.some(dependency => dependency.removal === 'unsupported'))
}
