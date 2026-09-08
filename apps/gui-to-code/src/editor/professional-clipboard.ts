import type {
  ElementKind,
  Fqn,
  RelationId,
  ViewId,
  ViewManualLayoutSnapshot,
} from '@likec4/core/types'
import type { CanvasPosition, EditorWorkspaceState } from './contracts'

export interface ClipboardElement {
  readonly id: Fqn
  readonly kind: ElementKind
  readonly title: string
  readonly description: string | null
  readonly technology: string | null
  readonly tags: readonly string[]
  readonly parentId: Fqn | null
  readonly position: CanvasPosition
}

export interface ClipboardRelation {
  readonly id: RelationId
  readonly sourceId: Fqn
  readonly targetId: Fqn
}

export interface CanvasClipboard {
  readonly version: 1
  readonly capturedRevision: number
  readonly sourceViewId: ViewId
  readonly elements: readonly ClipboardElement[]
  readonly relations: readonly ClipboardRelation[]
}

export interface PasteSubgraphInput {
  readonly clipboard: CanvasClipboard
  readonly viewId: ViewId
  readonly documentUri: string
  readonly offset?: CanvasPosition
}

export interface PlannedSubgraphElement {
  readonly sourceId: Fqn
  readonly id: string
  readonly createdId: Fqn
  readonly kind: ElementKind
  readonly title: string
  readonly description: string | null
  readonly technology: string | null
  readonly tags: readonly string[]
  readonly parentId: Fqn | null
  readonly position: CanvasPosition
}

export interface PlannedSubgraphRelation {
  readonly sourceId: Fqn
  readonly targetId: Fqn
}

export interface PasteSubgraphPlan {
  readonly viewId: ViewId
  readonly documentUri: string
  readonly elements: readonly PlannedSubgraphElement[]
  readonly relations: readonly PlannedSubgraphRelation[]
}

export type ProfessionalCommandIssueCode =
  | 'clipboard-empty'
  | 'clipboard-stale'
  | 'clipboard-view-unsupported'
  | 'clipboard-element-missing'
  | 'clipboard-kind-unavailable'
  | 'clipboard-target-document-missing'
  | 'clipboard-source-edit-failed'
  | 'clipboard-compile-rejected'
  | 'clipboard-verification-failed'
  | 'clipboard-layout-failed'
  | 'workspace-invalid'

export interface ProfessionalCommandIssue {
  readonly code: ProfessionalCommandIssueCode
  readonly message: string
}

export type PasteSubgraphResult =
  | {
    readonly status: 'applied'
    readonly command: 'subgraph.paste'
    readonly revision: number
    readonly viewId: ViewId
    readonly createdElementIds: readonly Fqn[]
    readonly createdRelationIds: readonly RelationId[]
  }
  | {
    readonly status: 'rejected'
    readonly revision: number
    readonly issues: readonly ProfessionalCommandIssue[]
  }
  | {
    readonly status: 'conflict'
    readonly revision: number
  }

interface LayoutNode {
  readonly id: string
  readonly modelRef?: string
  readonly x: number
  readonly y: number
}

function localEndpoint(reference: { readonly model: string; readonly project?: string }): string {
  return reference.project ? `@${reference.project}.${reference.model}` : reference.model
}

function parentId(id: Fqn): Fqn | null {
  const index = id.lastIndexOf('.')
  return index < 0 ? null : id.slice(0, index) as Fqn
}

function localId(id: Fqn): string {
  return id.slice(id.lastIndexOf('.') + 1)
}

function depth(id: Fqn): number {
  return id.split('.').length
}

function currentLayout(state: EditorWorkspaceState, viewId: ViewId): ViewManualLayoutSnapshot | null {
  return state.manualLayouts[viewId]
    ?? state.lastValidModel?.findView(viewId)?.$layouted
    ?? null
}

export function captureCanvasClipboard(
  state: EditorWorkspaceState,
  viewId: ViewId,
  selectedNodeIds: ReadonlySet<string>,
): CanvasClipboard | null {
  if (selectedNodeIds.size === 0 || state.compilation.status !== 'valid') return null
  const view = state.lastValidModel?.$data.views[viewId]
  if (!view || view._type !== 'element') return null
  const layout = currentLayout(state, viewId)
  if (!layout) return null

  const selectedModelIds = new Set<Fqn>()
  const positions = new Map<Fqn, CanvasPosition>()
  for (const node of layout.nodes as readonly LayoutNode[]) {
    const modelId = (node.modelRef ?? node.id) as Fqn
    if (!selectedNodeIds.has(node.id) && !selectedNodeIds.has(modelId)) continue
    if (!state.lastValidModel?.$data.elements[modelId]) continue
    selectedModelIds.add(modelId)
    positions.set(modelId, { x: node.x, y: node.y })
  }
  if (selectedModelIds.size === 0) return null

  const elements = [...selectedModelIds]
    .sort((left, right) => depth(left) - depth(right) || left.localeCompare(right))
    .map(id => {
      const element = state.lastValidModel!.$data.elements[id]!
      return {
        id,
        kind: element.kind as ElementKind,
        title: element.title,
        description: typeof element.description === 'string' ? element.description : null,
        technology: element.technology ?? null,
        tags: element.tags ? [...element.tags] : [],
        parentId: parentId(id),
        position: positions.get(id) ?? { x: 0, y: 0 },
      } satisfies ClipboardElement
    })

  const relations = Object.entries(state.lastValidModel?.$data.relations ?? {})
    .flatMap(([id, relation]) => {
      const sourceId = localEndpoint(relation.source) as Fqn
      const targetId = localEndpoint(relation.target) as Fqn
      return selectedModelIds.has(sourceId) && selectedModelIds.has(targetId)
        ? [{ id: id as RelationId, sourceId, targetId } satisfies ClipboardRelation]
        : []
    })

  return {
    version: 1,
    capturedRevision: state.revision,
    sourceViewId: viewId,
    elements,
    relations,
  }
}

export function refreshClipboardRevision(clipboard: CanvasClipboard, revision: number): CanvasClipboard {
  return { ...clipboard, capturedRevision: revision }
}

export function planSubgraphPaste(
  state: EditorWorkspaceState,
  input: PasteSubgraphInput,
): PasteSubgraphPlan | ProfessionalCommandIssue {
  const { clipboard, viewId } = input
  if (clipboard.elements.length === 0) {
    return { code: 'clipboard-empty', message: 'Буфер обмена не содержит элементов.' }
  }
  if (clipboard.capturedRevision !== state.revision) {
    return { code: 'clipboard-stale', message: 'Проект изменился после копирования. Скопируйте элементы ещё раз.' }
  }
  if (!input.documentUri.trim()) {
    return { code: 'clipboard-target-document-missing', message: 'Целевой документ для вставки не определён.' }
  }
  const view = state.lastValidModel?.$data.views[viewId]
  if (!view || view._type !== 'element') {
    return { code: 'clipboard-view-unsupported', message: 'Вставка логических элементов доступна только в статическом виде.' }
  }

  const modelElements = state.lastValidModel?.$data.elements ?? {}
  const availableKinds = new Set(Object.keys(state.lastValidModel?.$data.specification.elements ?? {}))
  for (const copied of clipboard.elements) {
    if (!modelElements[copied.id]) {
      return { code: 'clipboard-element-missing', message: `Исходный элемент ${copied.id} больше не существует.` }
    }
    if (!availableKinds.has(copied.kind)) {
      return { code: 'clipboard-kind-unavailable', message: `Тип ${copied.kind} больше не доступен в спецификации.` }
    }
  }

  const copiedIds = new Set(clipboard.elements.map(element => element.id))
  const existing = new Set(Object.keys(modelElements))
  const reservedFqns = new Set<Fqn>()
  const reservedRootIds = new Set<string>()
  const mapping = new Map<Fqn, Fqn>()
  const offset = input.offset ?? { x: 24, y: 24 }

  const elements: PlannedSubgraphElement[] = []
  for (const copied of [...clipboard.elements].sort((left, right) =>
    depth(left.id) - depth(right.id) || left.id.localeCompare(right.id))) {
    const mappedParent = copied.parentId && copiedIds.has(copied.parentId)
      ? mapping.get(copied.parentId) ?? null
      : copied.parentId
    const base = localId(copied.id)
    const available = (candidate: string): boolean => {
      const scoped = (mappedParent ? `${mappedParent}.${candidate}` : candidate) as Fqn
      return !existing.has(candidate)
        && !existing.has(scoped)
        && !reservedRootIds.has(candidate)
        && !reservedFqns.has(scoped)
    }
    let id = base
    if (!available(id)) {
      for (let suffix = 2;; suffix += 1) {
        const candidate = `${base}${suffix}`
        if (available(candidate)) {
          id = candidate
          break
        }
      }
    }
    const createdId = (mappedParent ? `${mappedParent}.${id}` : id) as Fqn
    reservedRootIds.add(id)
    reservedFqns.add(createdId)
    mapping.set(copied.id, createdId)
    const parentWasCopied = copied.parentId ? copiedIds.has(copied.parentId) : false
    elements.push({
      sourceId: copied.id,
      id,
      createdId,
      kind: copied.kind,
      title: copied.title,
      description: copied.description,
      technology: copied.technology,
      tags: [...copied.tags],
      parentId: mappedParent,
      position: parentWasCopied
        ? copied.position
        : { x: copied.position.x + offset.x, y: copied.position.y + offset.y },
    })
  }

  const relations = clipboard.relations.map(relation => ({
    sourceId: mapping.get(relation.sourceId)!,
    targetId: mapping.get(relation.targetId)!,
  }))

  return {
    viewId,
    documentUri: input.documentUri,
    elements,
    relations,
  }
}
