import type { Fqn, RelationId, ViewId, ViewManualLayoutSnapshot } from '@likec4/core/types'
import type { CompileResult, EditorWorkspaceState, SourceFile } from './contracts'
import type {
  PasteSubgraphInput,
  PasteSubgraphPlan,
  PasteSubgraphResult,
  ProfessionalCommandIssue,
} from './professional-clipboard'
import { planSubgraphPaste } from './professional-clipboard'
import type { ProfessionalSourceEditPort } from './professional-source-edits'
import { professionalSourceEditPort } from './professional-source-edits'

interface MutableSnapshotNode {
  readonly id: string
  readonly modelRef?: string
  x: number
  y: number
  readonly width: number
  readonly height: number
  readonly children: readonly string[]
  readonly [key: string]: unknown
}

interface MutableSnapshotEdge {
  readonly id: string
  readonly [key: string]: unknown
}

interface MutableSnapshot {
  readonly _stage: 'layouted'
  readonly _type: 'element' | 'dynamic' | 'deployment'
  readonly id: ViewId
  readonly hash: string
  nodes: MutableSnapshotNode[]
  edges: MutableSnapshotEdge[]
  bounds: { x: number; y: number; width: number; height: number }
  readonly autoLayout: object
  readonly [key: string]: unknown
}

type ManualLayouts = Readonly<Record<ViewId, ViewManualLayoutSnapshot>>

type VerifiedRelation = readonly [RelationId, unknown]

export interface ProfessionalWorkspaceContext {
  readonly state: EditorWorkspaceState
  readonly sourceEdits?: ProfessionalSourceEditPort
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

function issue(code: ProfessionalCommandIssue['code'], message: string): ProfessionalCommandIssue {
  return { code, message }
}

function rejected(
  state: EditorWorkspaceState,
  code: ProfessionalCommandIssue['code'],
  message: string,
): PasteSubgraphResult {
  return { status: 'rejected', revision: state.revision, issues: [issue(code, message)] }
}

function localEndpoint(reference: { readonly model: string; readonly project?: string }): string {
  return reference.project ? `@${reference.project}.${reference.model}` : reference.model
}

function equalStringArrays(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  const a = [...(left ?? [])].sort()
  const b = [...(right ?? [])].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function exactElementsVerified(
  state: EditorWorkspaceState,
  model: NonNullable<CompileResult['model']>,
  plan: PasteSubgraphPlan,
): boolean {
  const before = state.lastValidModel?.$data.elements ?? {}
  const after = model.$data.elements
  const added = Object.keys(after).filter(id => !before[id as Fqn]).sort()
  const expected = plan.elements.map(element => element.createdId).sort()
  if (added.length !== expected.length || added.some((id, index) => id !== expected[index])) return false
  if (Object.keys(after).length !== Object.keys(before).length + expected.length) return false
  return plan.elements.every(element => {
    const created = after[element.createdId]
    return !!created
      && created.kind === element.kind
      && created.title === element.title
      && (created.description ?? null) === element.description
      && (created.technology ?? null) === element.technology
      && equalStringArrays(created.tags ?? undefined, element.tags)
  })
}

function exactRelations(
  state: EditorWorkspaceState,
  model: NonNullable<CompileResult['model']>,
  plan: PasteSubgraphPlan,
): readonly VerifiedRelation[] | null {
  const before = state.lastValidModel?.$data.relations ?? {}
  const after = model.$data.relations
  const beforeIds = new Set(Object.keys(before))
  const added = Object.entries(after).filter(([id]) => !beforeIds.has(id))
  if (Object.keys(after).length !== Object.keys(before).length + plan.relations.length) return null
  if (added.length !== plan.relations.length) return null
  const actual = added.map(([, relation]) =>
    `${localEndpoint(relation.source)}→${localEndpoint(relation.target)}`).sort()
  const expected = plan.relations.map(relation => `${relation.sourceId}→${relation.targetId}`).sort()
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) return null
  return added.map(([id, relation]) => [id as RelationId, relation] as const)
}

function cloneLayouts(layouts: ManualLayouts): Record<ViewId, ViewManualLayoutSnapshot> {
  const result = {} as Record<ViewId, ViewManualLayoutSnapshot>
  for (const [id, snapshot] of Object.entries(layouts)) {
    result[id as ViewId] = structuredClone(snapshot)
  }
  return result
}

function boundsFromNodes(nodes: readonly MutableSnapshotNode[]) {
  if (nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const x = Math.min(...nodes.map(node => node.x))
  const y = Math.min(...nodes.map(node => node.y))
  const right = Math.max(...nodes.map(node => node.x + node.width))
  const bottom = Math.max(...nodes.map(node => node.y + node.height))
  return { x, y, width: right - x, height: bottom - y }
}

function positionedLayouts(
  state: EditorWorkspaceState,
  model: NonNullable<CompileResult['model']>,
  plan: PasteSubgraphPlan,
): Record<ViewId, ViewManualLayoutSnapshot> | null {
  const autoView = model.$data.views[plan.viewId]
  if (!autoView || autoView._type !== 'element') return null
  const snapshot = structuredClone(autoView) as unknown as MutableSnapshot
  const previous = state.manualLayouts[plan.viewId] as unknown as MutableSnapshot | undefined
  const previousNodes = new Map(previous?.nodes.map(node => [node.id, node]) ?? [])
  const previousEdges = new Map(previous?.edges.map(edge => [edge.id, edge]) ?? [])

  snapshot.nodes = snapshot.nodes.map(node => {
    const persisted = previousNodes.get(node.id)
    return persisted
      ? { ...node, x: persisted.x, y: persisted.y, width: persisted.width, height: persisted.height, children: [...node.children] }
      : node
  })
  snapshot.edges = snapshot.edges.map(edge => previousEdges.has(edge.id)
    ? structuredClone(previousEdges.get(edge.id)!)
    : edge)

  for (const element of plan.elements) {
    const node = snapshot.nodes.find(candidate => candidate.id === element.createdId || candidate.modelRef === element.createdId)
    if (!node) return null
    node.x = element.position.x
    node.y = element.position.y
  }
  snapshot.bounds = boundsFromNodes(snapshot.nodes)

  const next = cloneLayouts(state.manualLayouts)
  next[plan.viewId] = snapshot as unknown as ViewManualLayoutSnapshot
  return next
}

export async function applyPasteSubgraph(
  context: ProfessionalWorkspaceContext,
  input: PasteSubgraphInput,
  expectedRevision: number,
): Promise<PasteSubgraphResult> {
  const { state } = context
  if (expectedRevision !== state.revision) return { status: 'conflict', revision: state.revision }
  if (state.compilation.status !== 'valid' || !state.lastValidModel) {
    return rejected(state, 'workspace-invalid', 'Изменение отклонено: исправьте ошибки в коде проекта.')
  }

  const plan = planSubgraphPaste(state, input)
  if ('code' in plan) return { status: 'rejected', revision: state.revision, issues: [plan] }

  try {
    const candidateSources = await (context.sourceEdits ?? professionalSourceEditPort)
      .createSubgraph(state.committedSources, plan)
    const revision = state.revision + 1
    const compilation = await context.compileCandidate(revision, candidateSources)
    if (!compilation.model) {
      return rejected(state, 'clipboard-compile-rejected', 'Вставка отклонена: candidate model не компилируется.')
    }
    if (!exactElementsVerified(state, compilation.model, plan)) {
      return rejected(state, 'clipboard-verification-failed', 'Не удалось подтвердить точный набор созданных элементов.')
    }
    const relations = exactRelations(state, compilation.model, plan)
    if (!relations) {
      return rejected(state, 'clipboard-verification-failed', 'Не удалось подтвердить точный набор внутренних связей.')
    }
    const layouts = positionedLayouts(state, compilation.model, plan)
    if (!layouts) {
      return rejected(state, 'clipboard-layout-failed', 'Созданные элементы не удалось безопасно разместить в текущем виде.')
    }
    if (!context.isCurrent()) return { status: 'conflict', revision: context.currentRevision() }

    context.commitCandidate(revision, candidateSources, compilation.model, layouts)
    return {
      status: 'applied',
      command: 'subgraph.paste',
      revision,
      viewId: plan.viewId,
      createdElementIds: plan.elements.map(element => element.createdId),
      createdRelationIds: relations.map(([id]) => id),
    }
  } catch (_error) {
    return rejected(state, 'clipboard-source-edit-failed', 'Не удалось построить source-preserving план вставки.')
  }
}
