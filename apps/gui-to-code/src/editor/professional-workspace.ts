import type { Fqn, RelationId, ViewId, ViewManualLayoutSnapshot } from '@likec4/core/types'
import type { CompileResult, EditorWorkspaceState, RemovalDependencyReport, SourceFile } from './contracts'
import type {
  PasteSubgraphInput,
  PasteSubgraphPlan,
  PasteSubgraphResult,
  ProfessionalCommandIssue,
} from './professional-clipboard'
import { planSubgraphPaste } from './professional-clipboard'
import type {
  MultiRemovalInspection,
  MultiRemovalInspectionResult,
  ProfessionalRemovalIssue,
  RemoveSubgraphResult,
} from './professional-removal'
import {
  inspectionHasUnsupportedDependencies,
  normalizeRemovalRoots,
  removalElementIds,
} from './professional-removal'
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

export interface ProfessionalRemovalInspectionContext {
  readonly state: EditorWorkspaceState
  readonly inspectElementRemoval: (
    sources: readonly SourceFile[],
    id: Fqn,
  ) => Promise<RemovalDependencyReport>
  readonly isCurrent: () => boolean
  readonly currentRevision: () => number
}

function clipboardIssue(code: ProfessionalCommandIssue['code'], message: string): ProfessionalCommandIssue {
  return { code, message }
}

function removalIssue(code: ProfessionalRemovalIssue['code'], message: string): ProfessionalRemovalIssue {
  return { code, message }
}

function clipboardRejected(
  state: EditorWorkspaceState,
  code: ProfessionalCommandIssue['code'],
  message: string,
): PasteSubgraphResult {
  return { status: 'rejected', revision: state.revision, issues: [clipboardIssue(code, message)] }
}

function removalRejected(
  state: EditorWorkspaceState,
  code: ProfessionalRemovalIssue['code'],
  message: string,
): RemoveSubgraphResult {
  return { status: 'rejected', revision: state.revision, issues: [removalIssue(code, message)] }
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

function relationSignature(relation: {
  readonly source: { readonly model: string; readonly project?: string }
  readonly target: { readonly model: string; readonly project?: string }
  readonly title?: unknown
}): string {
  const title = typeof relation.title === 'string' ? relation.title : ''
  return `${localEndpoint(relation.source)}→${localEndpoint(relation.target)}\u0000${title}`
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
  const actual = added.map(([, relation]) => relationSignature(relation)).sort()
  const expected = plan.relations.map(relation =>
    `${relation.sourceId}→${relation.targetId}\u0000${relation.title ?? ''}`).sort()
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

function overlayPersistedLayout(
  autoView: unknown,
  previous: ViewManualLayoutSnapshot,
): ViewManualLayoutSnapshot {
  const snapshot = structuredClone(autoView) as MutableSnapshot
  const persisted = previous as unknown as MutableSnapshot
  const previousNodes = new Map(persisted.nodes.map(node => [node.id, node]))
  const previousEdges = new Map(persisted.edges.map(edge => [edge.id, edge]))
  snapshot.nodes = snapshot.nodes.map(node => {
    const old = previousNodes.get(node.id)
    return old
      ? { ...node, x: old.x, y: old.y, width: old.width, height: old.height, children: [...node.children] }
      : node
  })
  snapshot.edges = snapshot.edges.map(edge => previousEdges.has(edge.id)
    ? structuredClone(previousEdges.get(edge.id)!)
    : edge)
  snapshot.bounds = boundsFromNodes(snapshot.nodes)
  return snapshot as unknown as ViewManualLayoutSnapshot
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

function reconciledLayoutsAfterRemoval(
  state: EditorWorkspaceState,
  model: NonNullable<CompileResult['model']>,
): Record<ViewId, ViewManualLayoutSnapshot> {
  const next = {} as Record<ViewId, ViewManualLayoutSnapshot>
  for (const [rawViewId, previous] of Object.entries(state.manualLayouts)) {
    const viewId = rawViewId as ViewId
    const autoView = model.$data.views[viewId]
    if (!autoView) continue
    next[viewId] = overlayPersistedLayout(autoView, previous)
  }
  return next
}

function exactRemovalVerified(
  state: EditorWorkspaceState,
  model: NonNullable<CompileResult['model']>,
  inspection: MultiRemovalInspection,
): readonly Fqn[] | null {
  const removed = removalElementIds(state, inspection.roots)
  if (removed.length === 0) return null
  const removedSet = new Set<string>(removed)
  const before = Object.keys(state.lastValidModel?.$data.elements ?? {}).sort()
  const expected = before.filter(id => !removedSet.has(id))
  const actual = Object.keys(model.$data.elements).sort()
  return expected.length === actual.length && expected.every((id, index) => id === actual[index])
    ? removed
    : null
}

export async function inspectMultiRemoval(
  context: ProfessionalRemovalInspectionContext,
  ids: readonly Fqn[],
  expectedRevision: number,
): Promise<MultiRemovalInspectionResult> {
  const { state } = context
  if (expectedRevision !== state.revision) return { status: 'conflict', revision: state.revision }
  if (state.compilation.status !== 'valid' || !state.lastValidModel) {
    return {
      status: 'rejected',
      revision: state.revision,
      issues: [removalIssue('workspace-invalid', 'Изменение отклонено: исправьте ошибки в коде проекта.')],
    }
  }
  const roots = normalizeRemovalRoots(ids)
  if (roots.length === 0) {
    return {
      status: 'rejected',
      revision: state.revision,
      issues: [removalIssue('removal-empty', 'Нет выбранных элементов для удаления.')],
    }
  }
  const missing = roots.find(root => !state.lastValidModel?.$data.elements[root])
  if (missing) {
    return {
      status: 'rejected',
      revision: state.revision,
      issues: [removalIssue('removal-element-missing', `Элемент ${missing} больше не существует.`)],
    }
  }

  try {
    const reports: RemovalDependencyReport[] = []
    for (const root of roots) {
      const report = await context.inspectElementRemoval(state.committedSources, root)
      if (report.target !== root) {
        return {
          status: 'rejected',
          revision: state.revision,
          issues: [removalIssue('removal-inspection-failed', 'Отчёт удаления не соответствует выбранному элементу.')],
        }
      }
      reports.push(report)
    }
    if (!context.isCurrent()) return { status: 'conflict', revision: context.currentRevision() }
    const inspection: MultiRemovalInspection = { revision: state.revision, roots, reports }
    return { status: 'ready', revision: state.revision, inspection }
  } catch (_error) {
    return {
      status: 'rejected',
      revision: state.revision,
      issues: [removalIssue('removal-inspection-failed', 'Не удалось безопасно проверить зависимости выбранных элементов.')],
    }
  }
}

export async function applyRemoveSubgraph(
  context: ProfessionalWorkspaceContext,
  inspection: MultiRemovalInspection,
  expectedRevision: number,
): Promise<RemoveSubgraphResult> {
  const { state } = context
  if (expectedRevision !== state.revision || inspection.revision !== state.revision) {
    return { status: 'conflict', revision: state.revision }
  }
  if (state.compilation.status !== 'valid' || !state.lastValidModel) {
    return removalRejected(state, 'workspace-invalid', 'Изменение отклонено: исправьте ошибки в коде проекта.')
  }
  if (inspection.roots.length === 0 || inspection.reports.length !== inspection.roots.length) {
    return removalRejected(state, 'removal-empty', 'Подтверждение удаления не содержит актуального набора элементов.')
  }
  if (inspectionHasUnsupportedDependencies(inspection)) {
    return removalRejected(state, 'removal-unsupported', 'Некоторые зависимости нельзя удалить безопасно.')
  }
  const sourceEdits = context.sourceEdits ?? professionalSourceEditPort
  if (!sourceEdits.removeSubgraph) {
    return removalRejected(state, 'removal-source-edit-failed', 'Source layer не поддерживает атомарное удаление набора элементов.')
  }

  try {
    const candidateSources = await sourceEdits.removeSubgraph(state.committedSources, inspection)
    const revision = state.revision + 1
    const compilation = await context.compileCandidate(revision, candidateSources)
    if (!compilation.model) {
      return removalRejected(state, 'removal-compile-rejected', 'Удаление отклонено: candidate model не компилируется.')
    }
    const removedElementIds = exactRemovalVerified(state, compilation.model, inspection)
    if (!removedElementIds) {
      return removalRejected(state, 'removal-verification-failed', 'Не удалось подтвердить точный набор удалённых элементов.')
    }
    const layouts = reconciledLayoutsAfterRemoval(state, compilation.model)
    if (!context.isCurrent()) return { status: 'conflict', revision: context.currentRevision() }

    context.commitCandidate(revision, candidateSources, compilation.model, layouts)
    return {
      status: 'applied',
      command: 'subgraph.remove',
      revision,
      removedElementIds,
    }
  } catch (_error) {
    return removalRejected(state, 'removal-source-edit-failed', 'Не удалось построить source-preserving план удаления.')
  }
}

export async function applyPasteSubgraph(
  context: ProfessionalWorkspaceContext,
  input: PasteSubgraphInput,
  expectedRevision: number,
): Promise<PasteSubgraphResult> {
  const { state } = context
  if (expectedRevision !== state.revision) return { status: 'conflict', revision: state.revision }
  if (state.compilation.status !== 'valid' || !state.lastValidModel) {
    return clipboardRejected(state, 'workspace-invalid', 'Изменение отклонено: исправьте ошибки в коде проекта.')
  }

  const plan = planSubgraphPaste(state, input)
  if ('code' in plan) return { status: 'rejected', revision: state.revision, issues: [plan] }

  try {
    const candidateSources = await (context.sourceEdits ?? professionalSourceEditPort)
      .createSubgraph(state.committedSources, plan)
    const revision = state.revision + 1
    const compilation = await context.compileCandidate(revision, candidateSources)
    if (!compilation.model) {
      return clipboardRejected(state, 'clipboard-compile-rejected', 'Вставка отклонена: candidate model не компилируется.')
    }
    if (!exactElementsVerified(state, compilation.model, plan)) {
      return clipboardRejected(state, 'clipboard-verification-failed', 'Не удалось подтвердить точный набор созданных элементов.')
    }
    const relations = exactRelations(state, compilation.model, plan)
    if (!relations) {
      return clipboardRejected(state, 'clipboard-verification-failed', 'Не удалось подтвердить точный набор внутренних связей и их названия.')
    }
    const layouts = positionedLayouts(state, compilation.model, plan)
    if (!layouts) {
      return clipboardRejected(state, 'clipboard-layout-failed', 'Созданные элементы не удалось безопасно разместить в текущем виде.')
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
    return clipboardRejected(state, 'clipboard-source-edit-failed', 'Не удалось построить source-preserving план вставки.')
  }
}
