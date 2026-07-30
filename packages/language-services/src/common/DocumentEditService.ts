import type { ElementKind, Fqn, ProjectId } from '@likec4/core/types'
import type { AstNode, CstNode, LangiumDocument, ReferenceDescription } from 'langium'
import { findNodeForKeyword, findNodesForProperty } from 'langium'
import type { Position, Range } from 'vscode-languageserver-types'
import { URI } from 'vscode-uri'
import type { LikeC4, LikeC4Langium } from './LikeC4'

export type DocumentEditErrorCode =
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

export class DocumentEditError extends Error {
  readonly code: DocumentEditErrorCode
  readonly dependencies?: RemovalDependencyReport

  constructor(code: DocumentEditErrorCode, message: string, dependencies?: RemovalDependencyReport) {
    super(message)
    this.name = 'DocumentEditError'
    this.code = code
    if (dependencies) {
      this.dependencies = dependencies
    }
  }
}

export interface DocumentTextEdit {
  readonly uri: string
  readonly range: Range
  readonly newText: string
}

export interface SourceEditPlan {
  readonly baseRevisions: Readonly<Record<string, string>>
  readonly edits: readonly DocumentTextEdit[]
  readonly affectedDocuments: readonly string[]
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
  readonly range: Range
  readonly removal: 'contained' | 'separate' | 'unsupported'
}

export interface RemovalDependencyReport {
  readonly target: Fqn
  readonly revision: string
  readonly dependencies: readonly RemovalDependency[]
}

export interface AddElementInput {
  readonly id: string
  readonly kind: ElementKind
  readonly title?: string
  readonly documentUri?: string
  readonly project?: string
}

export interface AddRelationInput {
  readonly source: Fqn
  readonly target: Fqn
  readonly documentUri?: string
  readonly project?: string
}

export interface ElementPatch {
  readonly title?: string
  readonly description?: string | null
  readonly technology?: string | null
  readonly tags?: readonly string[]
}

export interface PatchElementInput {
  readonly target: Fqn
  readonly patch: ElementPatch
  readonly project?: string
}

export interface MoveElementInput {
  readonly target: Fqn
  readonly parent: Fqn | null
  readonly project?: string
}

export interface RenameElementInput {
  readonly target: Fqn
  readonly newId: string
  readonly project?: string
}

export interface RemoveElementInput {
  readonly target: Fqn
  readonly project?: string
}

export interface CascadeRemoveElementInput extends RemoveElementInput {
  readonly approvedDependencyIds?: readonly string[]
  readonly dependencyRevision?: string
}

interface ParsedElementDescriptor {
  readonly id: Fqn
  readonly astPath: string
  readonly kind: ElementKind
  readonly title?: string
  readonly summary?: unknown
  readonly description?: unknown
  readonly technology?: string
  readonly tags?: readonly string[]
}

interface ElementBodyNode extends AstNode {
  readonly tags?: AstNode
  readonly props?: readonly (AstNode & { readonly key?: string })[]
}

interface ElementNode extends AstNode {
  readonly body?: ElementBodyNode
}

interface LocatedElement {
  readonly target: Fqn
  readonly projectId: ProjectId
  readonly document: LangiumDocument
  readonly node: ElementNode
  readonly element: ParsedElementDescriptor
}

interface DependencyCandidate extends RemovalDependency {
  readonly removalEdit?: DocumentTextEdit
}

interface OffsetEdit {
  readonly start: number
  readonly end: number
  readonly newText: string
}

interface ContainerInsertion {
  readonly uri: string
  readonly position: Position
  readonly indent: string
  readonly prefix: string
  readonly suffix: string
}

const ID_PATTERN = /^([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*$/
const PLAIN_FQN_PATTERN = /^([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*(?:\.([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*)*$/
const editablePropertyKeys = new Set(['title', 'description', 'summary', 'technology'])
const referenceNodeTypes = new Set(['ElementRef', 'FqnRef', 'StrictFqnRef', 'StrictFqnElementRef'])

/**
 * Browser-compatible source edit planner backed by linked Langium documents.
 * Plans are immutable and revision-bound; callers apply them to candidate source.
 */
export class DocumentEditService {
  constructor(private readonly langium: LikeC4Langium) {
  }

  async planAddElement(input: AddElementInput): Promise<SourceEditPlan> {
    this.assertIdentifier(input.id)
    const projectId = this.projectId(input.project)
    const fqn = input.id as Fqn
    if (this.langium.likec4.likec4.ModelLocator.getParsedElement(fqn, projectId)) {
      throw new DocumentEditError('collision', `Element "${input.id}" already exists`)
    }

    const parsed = await this.langium.likec4.likec4.ModelBuilder.parseModel(projectId)
    if (!parsed?.$data.specification.elements[input.kind]) {
      throw new DocumentEditError('invalid-operation', `Unknown element kind "${input.kind}"`)
    }

    const document = this.findModelDocument(projectId, input.documentUri)
    const root = document.parseResult.value as AstNode & { models?: readonly AstNode[] }
    const modelCst = root.models?.[0]?.$cstNode
    if (!modelCst) {
      throw new DocumentEditError('not-found', 'No model block found in the selected document')
    }

    const insertion = insertionBeforeClosing(document, modelCst)
    const title = input.title ? ` '${escapeSingleQuoted(input.title)}'` : ''
    const newText = `${insertion.prefix}${insertion.indent}${input.kind} ${input.id}${title}\n${insertion.suffix}`

    return this.planFromEdits([{
      uri: document.uri.toString(),
      range: { start: insertion.position, end: insertion.position },
      newText,
    }])
  }

  async planAddRelation(input: AddRelationInput): Promise<SourceEditPlan> {
    if (input.source === input.target) {
      throw new DocumentEditError(
        'invalid-operation',
        'A logical relation requires different source and target elements',
      )
    }
    const sourceElement = this.locateElement(input.source, input.project)
    const targetElement = this.locateElement(input.target, input.project)
    if (sourceElement.projectId !== targetElement.projectId) {
      throw new DocumentEditError(
        'invalid-operation',
        'Cross-project logical relations are not supported by this edit planner',
      )
    }

    const document = this.findModelDocument(sourceElement.projectId, input.documentUri)
    const root = document.parseResult.value as AstNode & { models?: readonly AstNode[] }
    const modelCst = root.models?.[0]?.$cstNode
    if (!modelCst) {
      throw new DocumentEditError('not-found', 'No model block found in the selected document')
    }

    const insertion = insertionBeforeClosing(document, modelCst)
    const newText = `${insertion.prefix}${insertion.indent}${input.source} -> ${input.target}\n${insertion.suffix}`

    return this.planFromEdits([{
      uri: document.uri.toString(),
      range: { start: insertion.position, end: insertion.position },
      newText,
    }])
  }

  async planPatchElement(input: PatchElementInput): Promise<SourceEditPlan> {
    if (Object.keys(input.patch).length === 0) {
      throw new DocumentEditError('invalid-operation', 'Element patch is empty')
    }
    const located = this.locateElement(input.target, input.project)
    const patch = input.patch
    const title = patch.title === undefined ? located.element.title ?? localId(input.target) : patch.title.trim()
    if (!title) {
      throw new DocumentEditError('invalid-title', 'Element title must not be empty')
    }

    const parsed = await this.langium.likec4.likec4.ModelBuilder.parseModel(located.projectId)
    const availableTags = new Set(Object.keys(parsed?.$data.specification.tags ?? {}))
    const tags = patch.tags === undefined
      ? [...(located.element.tags ?? [])]
      : [...new Set(patch.tags)].sort((left, right) => left.localeCompare(right))
    const invalidTag = tags.find(tag => !availableTags.has(tag))
    if (invalidTag) {
      throw new DocumentEditError('invalid-tag', `Unknown element tag "${invalidTag}"`)
    }

    const description = patch.description === undefined
      ? stringValue(located.element.description ?? located.element.summary)
      : patch.description
    const technology = patch.technology === undefined ? located.element.technology ?? null : patch.technology
    const source = located.document.textDocument.getText()
    const cst = located.node.$cstNode
    if (!cst) {
      throw new DocumentEditError('not-found', `Source range for "${input.target}" was not found`)
    }

    const edits: OffsetEdit[] = []
    const positional = findNodesForProperty(cst, 'props')
    const body = located.node.body
    const bodyCst = body?.$cstNode
    if (positional.length > 0) {
      const start = positional[0]!.offset
      const end = bodyCst?.offset ?? cst.end
      const removedHeader = source.slice(start, end)
      if (removedHeader.includes('//') || removedHeader.includes('/*')) {
        throw new DocumentEditError(
          'invalid-operation',
          'Cannot safely normalize positional properties that contain comments',
        )
      }
      edits.push({ start, end, newText: bodyCst ? ' ' : '' })
    }

    if (body) {
      if (!bodyCst) {
        throw new DocumentEditError('not-found', 'Element body source range was not found')
      }
      if (body.tags?.$cstNode) {
        edits.push(offsetRemoval(located.document, body.tags.$cstNode))
      }
      for (const property of body.props ?? []) {
        if (property.key && editablePropertyKeys.has(property.key) && property.$cstNode) {
          edits.push(offsetRemoval(located.document, property.$cstNode))
        }
      }
      const opening = findNodeForKeyword(bodyCst, '{')
      if (!opening) {
        throw new DocumentEditError('not-found', 'Element body opening brace was not found')
      }
      const childIndent = `${lineIndent(source, cst.offset)}  `
      const properties = propertyLines({ title, description, technology, tags })
      edits.push({
        start: opening.end,
        end: opening.end,
        newText: `\n${properties.map(line => `${childIndent}${line}`).join('\n')}`,
      })
    } else {
      const indent = lineIndent(source, cst.offset)
      const childIndent = `${indent}  `
      const properties = propertyLines({ title, description, technology, tags })
      edits.push({
        start: cst.end,
        end: cst.end,
        newText: ` {\n${properties.map(line => `${childIndent}${line}`).join('\n')}\n${indent}}`,
      })
    }

    const replacement = applyOffsetEdits(source, edits, cst.offset, cst.end)
    return this.planFromEdits([{
      uri: located.document.uri.toString(),
      range: cst.range,
      newText: replacement,
    }])
  }

  async planMoveElement(input: MoveElementInput): Promise<SourceEditPlan> {
    const located = this.locateElement(input.target, input.project)
    const parent = input.parent ? this.locateElement(input.parent, input.project) : null
    if (parent && parent.projectId !== located.projectId) {
      throw new DocumentEditError('invalid-parent', 'Cross-project element moves are not supported')
    }
    if (input.parent === input.target) {
      throw new DocumentEditError('move-cycle', 'An element cannot be its own parent')
    }
    if (input.parent?.startsWith(`${input.target}.`)) {
      throw new DocumentEditError('move-cycle', 'An element cannot be moved under its own descendant')
    }

    const nextTarget = (input.parent ? `${input.parent}.${localId(input.target)}` : localId(input.target)) as Fqn
    if (nextTarget === input.target) {
      throw new DocumentEditError('invalid-operation', 'Element already has the selected parent')
    }
    const mapping = this.subtreeMapping(input.target, nextTarget, located.projectId)
    const referenceEdits = this.referenceRemapEdits(mapping, located.projectId)
    const removal = this.removalEdit(located.document, located.node)
    const source = located.document.textDocument.getText()
    const removalStart = located.document.textDocument.offsetAt(removal.range.start)
    const removalEnd = located.document.textDocument.offsetAt(removal.range.end)
    const internalReferences = referenceEdits.filter(edit => {
      if (edit.uri !== located.document.uri.toString()) return false
      const start = located.document.textDocument.offsetAt(edit.range.start)
      const end = located.document.textDocument.offsetAt(edit.range.end)
      return start >= removalStart && end <= removalEnd
    })
    const movedSource = applyDocumentTextEdits(
      source.slice(removalStart, removalEnd),
      internalReferences.map(edit => ({
        range: shiftRange(located.document, edit.range, removalStart),
        newText: edit.newText,
      })),
      sourceRevision(source.slice(removalStart, removalEnd)),
    )
    const destination = parent
      ? this.parentInsertion(parent)
      : this.rootInsertion(located.projectId, located.document.uri.toString())
    const movedText = reindentBlock(movedSource, destination.indent)
    const externalReferences = referenceEdits.filter(edit => !internalReferences.includes(edit))

    return this.planFromEdits([
      removal,
      {
        uri: destination.uri,
        range: { start: destination.position, end: destination.position },
        newText: `${destination.prefix}${movedText}\n${destination.suffix}`,
      },
      ...externalReferences,
    ])
  }

  async planRenameElement(input: RenameElementInput): Promise<SourceEditPlan> {
    this.assertIdentifier(input.newId)
    const located = this.locateElement(input.target, input.project)
    if (input.newId === localId(input.target)) {
      throw new DocumentEditError('invalid-operation', 'Element already has this local identifier')
    }
    const parent = parentFqn(input.target)
    const nextFqn = (parent ? `${parent}.${input.newId}` : input.newId) as Fqn
    const mapping = this.subtreeMapping(input.target, nextFqn, located.projectId)
    const nameNode = this.langium.likec4.references.NameProvider.getNameNode(located.node)
    if (!nameNode) {
      throw new DocumentEditError('not-found', `Declaration range for "${input.target}" was not found`)
    }

    return this.planFromEdits([
      {
        uri: located.document.uri.toString(),
        range: nameNode.range,
        newText: input.newId,
      },
      ...this.referenceRemapEdits(mapping, located.projectId),
    ])
  }

  inspectRemoveElement(input: RemoveElementInput): RemovalDependencyReport {
    const located = this.locateElement(input.target, input.project)
    const dependencies = this.dependencyCandidates(located).map(({ removalEdit: _edit, ...dependency }) => dependency)
    return {
      target: input.target,
      revision: this.reportRevision(located, dependencies),
      dependencies,
    }
  }

  planRemoveElement(input: CascadeRemoveElementInput): SourceEditPlan {
    const located = this.locateElement(input.target, input.project)
    const candidates = this.dependencyCandidates(located)
    const dependencies = candidates.map(({ removalEdit: _edit, ...dependency }) => dependency)
    const report: RemovalDependencyReport = {
      target: input.target,
      revision: this.reportRevision(located, dependencies),
      dependencies,
    }
    const approved = new Set(input.approvedDependencyIds ?? [])

    if (input.dependencyRevision !== report.revision) {
      throw new DocumentEditError(
        'stale-document',
        'Removal dependencies changed; inspect them again before approving cascade removal',
        report,
      )
    }
    const missing = dependencies.filter(dependency => !approved.has(dependency.id))
    const unknown = [...approved].filter(id => !dependencies.some(dependency => dependency.id === id))
    if (missing.length > 0 || unknown.length > 0) {
      throw new DocumentEditError(
        'dependencies-not-approved',
        'Every current dependency must be approved explicitly',
        report,
      )
    }
    if (dependencies.some(dependency => dependency.removal === 'unsupported')) {
      throw new DocumentEditError(
        'unsupported-cascade',
        'At least one dependency cannot be removed safely by the current source-preserving planner',
        report,
      )
    }

    const edits: DocumentTextEdit[] = [this.removalEdit(located.document, located.node)]
    for (const candidate of candidates) {
      if (candidate.removal === 'separate' && candidate.removalEdit && approved.has(candidate.id)) {
        edits.push(candidate.removalEdit)
      }
    }
    return this.planFromEdits(collapseContainedEdits(edits))
  }

  private subtreeMapping(target: Fqn, nextTarget: Fqn, projectId: ProjectId): ReadonlyMap<Fqn, Fqn> {
    const subtree = this.subtree(target, projectId)
    const subtreeIds = new Set(subtree.map(element => element.target))
    const mapping = new Map<Fqn, Fqn>()
    for (const element of subtree) {
      const suffix = element.target === target ? '' : element.target.slice(target.length)
      const next = `${nextTarget}${suffix}` as Fqn
      const collision = this.langium.likec4.likec4.ModelLocator.getParsedElement(next, projectId)
      if (collision && !subtreeIds.has(next)) {
        throw new DocumentEditError('collision', `Element "${next}" already exists`)
      }
      mapping.set(element.target, next)
    }
    return mapping
  }

  private subtree(target: Fqn, projectId: ProjectId): LocatedElement[] {
    const result: LocatedElement[] = []
    for (const parsedDocument of this.langium.likec4.likec4.ModelParser.documents(projectId)) {
      for (const element of parsedDocument.c4Elements) {
        if (element.id !== target && !element.id.startsWith(`${target}.`)) continue
        const node = this.langium.likec4.workspace.AstNodeLocator.getAstNode(
          parsedDocument.parseResult.value,
          element.astPath,
        ) as ElementNode | undefined
        if (!node?.$cstNode) {
          throw new DocumentEditError('not-found', `Source range for "${element.id}" was not found`)
        }
        result.push({
          target: element.id,
          projectId,
          document: parsedDocument,
          node,
          element: element as ParsedElementDescriptor,
        })
      }
    }
    if (result.length === 0) {
      throw new DocumentEditError('not-found', `Element "${target}" was not found`)
    }
    return result.sort((left, right) => left.target.localeCompare(right.target))
  }

  private referenceRemapEdits(mapping: ReadonlyMap<Fqn, Fqn>, projectId: ProjectId): DocumentTextEdit[] {
    const candidates = new Map<string, { readonly depth: number; readonly edit: DocumentTextEdit }>()
    for (const [oldFqn, newFqn] of mapping) {
      const located = this.locateElement(oldFqn, projectId)
      for (const reference of this.referencesTo(located.node)) {
        const sourceDocument = this.langium.shared.workspace.LangiumDocuments.getDocument(reference.sourceUri)
        if (!sourceDocument) {
          throw new DocumentEditError('unsupported-reference', 'Reference source document is unavailable')
        }
        const sourceNode = this.langium.likec4.workspace.AstNodeLocator.getAstNode(
          sourceDocument.parseResult.value,
          reference.sourcePath,
        )
        const expression = referenceExpressionNode(sourceNode)
        const expressionCst = expression?.$cstNode
        if (!expressionCst || !PLAIN_FQN_PATTERN.test(expressionCst.text)) {
          throw new DocumentEditError(
            'unsupported-reference',
            `Reference to "${oldFqn}" cannot be rewritten safely`,
          )
        }
        const edit: DocumentTextEdit = {
          uri: sourceDocument.uri.toString(),
          range: expressionCst.range,
          newText: newFqn,
        }
        const key = editKey(edit)
        const depth = oldFqn.split('.').length
        const previous = candidates.get(key)
        if (!previous || depth > previous.depth) {
          candidates.set(key, { depth, edit })
        }
      }
    }
    return [...candidates.values()].map(candidate => candidate.edit)
  }

  private dependencyCandidates(located: LocatedElement): DependencyCandidate[] {
    const targetRange = this.removalEdit(located.document, located.node).range
    const candidates: DependencyCandidate[] = []
    const subtree = this.subtree(located.target, located.projectId)

    for (const element of subtree) {
      if (element.target === located.target) continue
      const range = element.node.$cstNode!.range
      candidates.push({
        id: dependencyId('child-element', element.document.uri.toString(), range),
        kind: 'child-element',
        uri: element.document.uri.toString(),
        range,
        removal: element.document.uri.toString() === located.document.uri.toString() && rangeContains(targetRange, range)
          ? 'contained'
          : 'unsupported',
      })
    }

    for (const element of subtree) {
      for (const reference of this.referencesTo(element.node)) {
        const sourceDocument = this.langium.shared.workspace.LangiumDocuments.getDocument(reference.sourceUri)
        if (!sourceDocument) continue
        const sourceNode = this.langium.likec4.workspace.AstNodeLocator.getAstNode(
          sourceDocument.parseResult.value,
          reference.sourcePath,
        )
        const kind = classifyDependency(sourceNode)
        const removableNode = sourceNode ? findRemovableAncestor(sourceNode, kind) : undefined
        const removalEdit = removableNode ? this.removalEdit(sourceDocument, removableNode) : undefined
        const range = reference.segment.range
        const contained = sourceDocument.uri.toString() === located.document.uri.toString()
          && rangeContains(targetRange, range)

        candidates.push({
          id: dependencyId(kind, sourceDocument.uri.toString(), range),
          kind,
          uri: sourceDocument.uri.toString(),
          range,
          removal: contained ? 'contained' : removalEdit ? 'separate' : 'unsupported',
          ...(!contained && removalEdit ? { removalEdit } : {}),
        })
      }
    }

    return dedupeCandidates(candidates)
  }

  private reportRevision(located: LocatedElement, dependencies: readonly RemovalDependency[]): string {
    const uris = new Set([located.document.uri.toString(), ...dependencies.map(dependency => dependency.uri)])
    const revisions = [...uris].sort().map(uri => {
      const document = this.langium.shared.workspace.LangiumDocuments.getDocument(URI.parse(uri))
      if (!document) {
        throw new DocumentEditError('not-found', `Document "${uri}" was not found`)
      }
      return `${uri}:${sourceRevision(document.textDocument.getText())}`
    })
    return sourceRevision(`${located.target}\n${revisions.join('\n')}\n${dependencies.map(d => d.id).join('\n')}`)
  }

  private rootInsertion(projectId: ProjectId, documentUri: string): ContainerInsertion {
    const document = this.findModelDocument(projectId, documentUri)
    const root = document.parseResult.value as AstNode & { models?: readonly AstNode[] }
    const modelCst = root.models?.[0]?.$cstNode
    if (!modelCst) {
      throw new DocumentEditError('not-found', 'No model block found in the selected document')
    }
    const insertion = insertionBeforeClosing(document, modelCst)
    return { uri: document.uri.toString(), ...insertion }
  }

  private parentInsertion(parent: LocatedElement): ContainerInsertion {
    const source = parent.document.textDocument.getText()
    const parentCst = parent.node.$cstNode
    if (!parentCst) {
      throw new DocumentEditError('not-found', `Source range for "${parent.target}" was not found`)
    }
    const bodyCst = parent.node.body?.$cstNode
    if (bodyCst) {
      const insertion = insertionBeforeClosing(parent.document, bodyCst)
      return { uri: parent.document.uri.toString(), ...insertion }
    }
    const parentIndent = lineIndent(source, parentCst.offset)
    const position = parent.document.textDocument.positionAt(parentCst.end)
    return {
      uri: parent.document.uri.toString(),
      position,
      indent: `${parentIndent}  `,
      prefix: ' {\n',
      suffix: parentIndent + '}',
    }
  }

  private locateElement(target: Fqn, project?: string | ProjectId): LocatedElement {
    const projectId = this.projectId(project as string | undefined)
    const located = this.langium.likec4.likec4.ModelLocator.getParsedElement(target, projectId)
    if (!located) {
      throw new DocumentEditError('not-found', `Element "${target}" was not found`)
    }
    const node = this.langium.likec4.workspace.AstNodeLocator.getAstNode(
      located.document.parseResult.value,
      located.element.astPath,
    ) as ElementNode | undefined
    if (!node?.$cstNode) {
      throw new DocumentEditError('not-found', `Source range for "${target}" was not found`)
    }
    return {
      target,
      projectId: located.projectId,
      document: located.document,
      node,
      element: located.element as ParsedElementDescriptor,
    }
  }

  private referencesTo(node: AstNode): ReferenceDescription[] {
    return [...this.langium.likec4.references.References.findReferences(node, { includeDeclaration: false })]
  }

  private findModelDocument(projectId: ProjectId, documentUri?: string): LangiumDocument {
    const documents = [...this.langium.shared.workspace.LangiumDocuments.userDocuments]
      .filter(document => document.likec4ProjectId === projectId)
    const selected = documentUri
      ? documents.find(document => document.uri.toString() === URI.parse(documentUri).toString())
      : documents.find(document => {
        const root = document.parseResult.value as AstNode & { models?: readonly AstNode[] }
        return !!root.models?.length
      })
    if (!selected) {
      throw new DocumentEditError('not-found', 'No matching LikeC4 model document found')
    }
    return selected
  }

  private projectId(project?: string): ProjectId {
    return this.langium.shared.workspace.ProjectsManager.ensureProjectId(project as ProjectId | undefined)
  }

  private assertIdentifier(id: string): void {
    if (!ID_PATTERN.test(id)) {
      throw new DocumentEditError('invalid-identifier', `Invalid LikeC4 identifier "${id}"`)
    }
  }

  private removalEdit(document: LangiumDocument, node: AstNode): DocumentTextEdit {
    const cst = node.$cstNode
    if (!cst) {
      throw new DocumentEditError('not-found', 'Source range for removable dependency was not found')
    }
    const range = expandedLineRange(document, cst)
    return { uri: document.uri.toString(), range, newText: '' }
  }

  private planFromEdits(edits: readonly DocumentTextEdit[]): SourceEditPlan {
    const normalized = normalizeEdits(edits)
    const affectedDocuments = [...new Set(normalized.map(edit => edit.uri))].sort()
    const baseRevisions: Record<string, string> = {}
    for (const uri of affectedDocuments) {
      const document = this.langium.shared.workspace.LangiumDocuments.getDocument(URI.parse(uri))
      if (!document) {
        throw new DocumentEditError('not-found', `Document "${uri}" was not found`)
      }
      baseRevisions[uri] = sourceRevision(document.textDocument.getText())
    }
    return { baseRevisions, edits: normalized, affectedDocuments }
  }
}

/** Create a public edit planner for a browser or Node LikeC4 instance. */
export function createDocumentEditService(likec4: LikeC4): DocumentEditService {
  const langium = (likec4 as unknown as { readonly langium: LikeC4Langium }).langium
  return new DocumentEditService(langium)
}

/** Stable revision digest without Node-only crypto APIs. */
export function sourceRevision(source: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}:${source.length}`
}

/** Apply one document's edits after checking the exact source revision. */
export function applyDocumentTextEdits(
  source: string,
  edits: readonly Pick<DocumentTextEdit, 'range' | 'newText'>[],
  expectedRevision: string,
): string {
  const actualRevision = sourceRevision(source)
  if (actualRevision !== expectedRevision) {
    throw new DocumentEditError(
      'stale-document',
      `Source revision changed (expected ${expectedRevision}, actual ${actualRevision})`,
    )
  }
  const positioned = edits.map(edit => ({
    start: offsetAt(source, edit.range.start),
    end: offsetAt(source, edit.range.end),
    newText: edit.newText,
  })).sort((left, right) => right.start - left.start || right.end - left.end)

  let result = source
  let previousStart = source.length
  for (const edit of positioned) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > source.length || edit.end > previousStart) {
      throw new DocumentEditError('invalid-operation', 'Source edits must be valid and non-overlapping')
    }
    result = `${result.slice(0, edit.start)}${edit.newText}${result.slice(edit.end)}`
    previousStart = edit.start
  }
  return result
}

function propertyLines(input: {
  readonly title: string
  readonly description: string | null
  readonly technology: string | null
  readonly tags: readonly string[]
}): string[] {
  return [
    `title '${escapeSingleQuoted(input.title)}'`,
    ...(input.description === null ? [] : [`description '${escapeSingleQuoted(input.description)}'`]),
    ...(input.technology === null ? [] : [`technology '${escapeSingleQuoted(input.technology)}'`]),
    ...(input.tags.length === 0 ? [] : [input.tags.map(tag => `#${tag}`).join(', ')]),
  ]
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function localId(fqn: Fqn): string {
  return fqn.slice(fqn.lastIndexOf('.') + 1)
}

function referenceExpressionNode(node: AstNode | undefined): AstNode | undefined {
  if (!node) return undefined
  let current = node
  while (current.$container && referenceNodeTypes.has(current.$container.$type)) {
    current = current.$container
  }
  return referenceNodeTypes.has(current.$type) ? current : node
}

function insertionBeforeClosing(document: LangiumDocument, cst: CstNode): Omit<ContainerInsertion, 'uri'> {
  const source = document.textDocument.getText()
  const closingOffset = Math.max(cst.offset, cst.end - 1)
  const closingLineStart = source.lastIndexOf('\n', Math.max(0, closingOffset - 1)) + 1
  const closingIndent = source.slice(closingLineStart, closingOffset)
  const insertionOffset = /^[\t ]*$/.test(closingIndent) ? closingLineStart : closingOffset
  const actualClosingIndent = /^[\t ]*$/.test(closingIndent) ? closingIndent : ''
  return {
    position: document.textDocument.positionAt(insertionOffset),
    indent: `${actualClosingIndent}  `,
    prefix: insertionOffset > 0 && source[insertionOffset - 1] !== '\n' ? '\n' : '',
    suffix: actualClosingIndent,
  }
}

function lineIndent(source: string, offset: number): string {
  const start = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  const prefix = source.slice(start, offset)
  return /^[\t ]*$/.test(prefix) ? prefix : ''
}

function expandedLineRange(document: LangiumDocument, cst: CstNode): Range {
  const source = document.textDocument.getText()
  let start = cst.offset
  let end = cst.end
  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  if (/^[\t ]*$/.test(source.slice(lineStart, start))) start = lineStart
  const lineEnd = source.indexOf('\n', end)
  if (lineEnd >= 0 && /^[\t ]*$/.test(source.slice(end, lineEnd))) end = lineEnd + 1
  return { start: document.textDocument.positionAt(start), end: document.textDocument.positionAt(end) }
}

function offsetRemoval(document: LangiumDocument, cst: CstNode): OffsetEdit {
  const range = expandedLineRange(document, cst)
  return {
    start: document.textDocument.offsetAt(range.start),
    end: document.textDocument.offsetAt(range.end),
    newText: '',
  }
}

function applyOffsetEdits(source: string, edits: readonly OffsetEdit[], start: number, end: number): string {
  const relevant = edits.map(edit => ({
    start: edit.start - start,
    end: edit.end - start,
    newText: edit.newText,
  })).sort((left, right) => right.start - left.start || right.end - left.end)
  let result = source.slice(start, end)
  let previousStart = result.length
  for (const edit of relevant) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > result.length || edit.end > previousStart) {
      throw new DocumentEditError('invalid-operation', 'Target declaration edits overlap or escape the target range')
    }
    result = `${result.slice(0, edit.start)}${edit.newText}${result.slice(edit.end)}`
    previousStart = edit.start
  }
  return result
}

function shiftRange(document: LangiumDocument, range: Range, baseOffset: number): Range {
  const start = document.textDocument.offsetAt(range.start) - baseOffset
  const end = document.textDocument.offsetAt(range.end) - baseOffset
  const text = document.textDocument.getText().slice(baseOffset)
  return { start: positionAt(text, start), end: positionAt(text, end) }
}

function reindentBlock(source: string, indent: string): string {
  const withoutTrailingNewline = source.endsWith('\n') ? source.slice(0, -1) : source
  const lines = withoutTrailingNewline.split('\n')
  const firstContent = lines.find(line => line.trim().length > 0) ?? ''
  const oldIndent = firstContent.slice(0, firstContent.length - firstContent.trimStart().length)
  return lines.map(line => {
    if (line.trim().length === 0) return ''
    const dedented = oldIndent && line.startsWith(oldIndent) ? line.slice(oldIndent.length) : line.trimStart()
    return `${indent}${dedented}`
  }).join('\n')
}

function classifyDependency(node: AstNode | undefined): RemovalDependencyKind {
  let current = node
  const containerProperties = new Set<string>()
  while (current) {
    if (current.$containerProperty) containerProperties.add(current.$containerProperty)
    const type = current.$type
    if (type.includes('Relation')) {
      if (containerProperties.has('source')) return 'outgoing-relation'
      if (containerProperties.has('target')) return 'incoming-relation'
      return 'semantic-reference'
    }
    if (type === 'ElementView') return containerProperties.has('viewOf') ? 'scoped-view' : 'view-reference'
    if (type.includes('View') || type.includes('Rule') || type.includes('Predicate')) return 'view-reference'
    current = current.$container
  }
  return 'semantic-reference'
}

function findRemovableAncestor(node: AstNode, kind: RemovalDependencyKind): AstNode | undefined {
  let current: AstNode | undefined = node
  while (current) {
    const type = current.$type
    if (
      ((kind === 'incoming-relation' || kind === 'outgoing-relation') && type.includes('Relation'))
      || (kind === 'scoped-view' && type === 'ElementView')
      || (kind === 'view-reference' && (type.includes('Rule') || type.includes('Predicate')))
    ) {
      return current
    }
    current = current.$container
  }
  return undefined
}

function parentFqn(fqn: Fqn): string | undefined {
  const index = fqn.lastIndexOf('.')
  return index < 0 ? undefined : fqn.slice(0, index)
}

function escapeSingleQuoted(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'')
}

function dependencyId(kind: RemovalDependencyKind, uri: string, range: Range): string {
  return `${kind}:${uri}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`
}

function editKey(edit: DocumentTextEdit): string {
  const { start, end } = edit.range
  return `${edit.uri}:${start.line}:${start.character}:${end.line}:${end.character}`
}

function dedupeCandidates(candidates: readonly DependencyCandidate[]): DependencyCandidate[] {
  const byId = new Map<string, DependencyCandidate>()
  for (const candidate of candidates) byId.set(candidate.id, candidate)
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function normalizeEdits(edits: readonly DocumentTextEdit[]): DocumentTextEdit[] {
  const byKey = new Map<string, DocumentTextEdit>()
  for (const edit of edits) {
    const key = editKey(edit)
    const previous = byKey.get(key)
    if (previous && previous.newText !== edit.newText) {
      throw new DocumentEditError('ambiguous-reference', 'The same source range requires conflicting rewrites')
    }
    byKey.set(key, edit)
  }
  const normalized = [...byKey.values()].sort((left, right) => {
    return left.uri.localeCompare(right.uri)
      || comparePositions(left.range.start, right.range.start)
      || comparePositions(left.range.end, right.range.end)
      || left.newText.localeCompare(right.newText)
  })
  for (let index = 1; index < normalized.length; index++) {
    const previous = normalized[index - 1]!
    const current = normalized[index]!
    if (previous.uri === current.uri && comparePositions(current.range.start, previous.range.end) < 0) {
      throw new DocumentEditError('ambiguous-reference', 'Generated source edits overlap')
    }
  }
  return normalized
}

function collapseContainedEdits(edits: readonly DocumentTextEdit[]): DocumentTextEdit[] {
  return edits.filter((candidate, index) => {
    return !edits.some((other, otherIndex) => {
      return index !== otherIndex
        && candidate.uri === other.uri
        && rangeContains(other.range, candidate.range)
        && !rangesEqual(other.range, candidate.range)
    })
  })
}

function comparePositions(left: Position, right: Position): number {
  return left.line - right.line || left.character - right.character
}

function rangesEqual(left: Range, right: Range): boolean {
  return comparePositions(left.start, right.start) === 0 && comparePositions(left.end, right.end) === 0
}

function rangeContains(outer: Range, inner: Range): boolean {
  return comparePositions(outer.start, inner.start) <= 0 && comparePositions(outer.end, inner.end) >= 0
}

function offsetAt(source: string, position: Position): number {
  if (position.line < 0 || position.character < 0) return -1
  let line = 0
  let offset = 0
  while (line < position.line && offset < source.length) {
    const next = source.indexOf('\n', offset)
    if (next < 0) return source.length
    offset = next + 1
    line++
  }
  return Math.min(source.length, offset + position.character)
}

function positionAt(source: string, targetOffset: number): Position {
  const safeOffset = Math.max(0, Math.min(source.length, targetOffset))
  let line = 0
  let lineStart = 0
  for (let index = 0; index < safeOffset; index++) {
    if (source[index] === '\n') {
      line++
      lineStart = index + 1
    }
  }
  return { line, character: safeOffset - lineStart }
}
