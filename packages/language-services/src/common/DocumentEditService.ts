import type { ElementKind, Fqn, ProjectId } from '@likec4/core/types'
import type { AstNode, LangiumDocument, ReferenceDescription } from 'langium'
import type { Position, Range } from 'vscode-languageserver-types'
import { URI } from 'vscode-uri'
import type { LikeC4, LikeC4Langium } from './LikeC4'

export type DocumentEditErrorCode =
  | 'ambiguous-reference'
  | 'collision'
  | 'dependencies-not-approved'
  | 'invalid-identifier'
  | 'invalid-operation'
  | 'not-found'
  | 'stale-document'
  | 'unsupported-cascade'

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

interface LocatedElement {
  readonly target: Fqn
  readonly projectId: ProjectId
  readonly document: LangiumDocument
  readonly node: AstNode
}

interface DependencyCandidate extends RemovalDependency {
  readonly removalEdit?: DocumentTextEdit
}

const ID_PATTERN = /^([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*$/

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

    const source = document.textDocument.getText()
    const closingOffset = Math.max(modelCst.offset, modelCst.end - 1)
    const closingLineStart = source.lastIndexOf('\n', Math.max(0, closingOffset - 1)) + 1
    const closingIndent = source.slice(closingLineStart, closingOffset)
    const insertionOffset = /^\s*$/.test(closingIndent) ? closingLineStart : closingOffset
    const actualClosingIndent = /^\s*$/.test(closingIndent) ? closingIndent : ''
    const childIndent = `${actualClosingIndent}  `
    const prefix = insertionOffset > 0 && source[insertionOffset - 1] !== '\n' ? '\n' : ''
    const title = input.title ? ` '${escapeSingleQuoted(input.title)}'` : ''
    const newText = `${prefix}${childIndent}${input.kind} ${input.id}${title}\n${actualClosingIndent}`
    const position = document.textDocument.positionAt(insertionOffset)

    return this.planFromEdits([{
      uri: document.uri.toString(),
      range: { start: position, end: position },
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

    const source = document.textDocument.getText()
    const closingOffset = Math.max(modelCst.offset, modelCst.end - 1)
    const closingLineStart = source.lastIndexOf('\n', Math.max(0, closingOffset - 1)) + 1
    const closingIndent = source.slice(closingLineStart, closingOffset)
    const insertionOffset = /^\s*$/.test(closingIndent) ? closingLineStart : closingOffset
    const actualClosingIndent = /^\s*$/.test(closingIndent) ? closingIndent : ''
    const childIndent = `${actualClosingIndent}  `
    const prefix = insertionOffset > 0 && source[insertionOffset - 1] !== '\n' ? '\n' : ''
    const newText = `${prefix}${childIndent}${input.source} -> ${input.target}\n${actualClosingIndent}`
    const position = document.textDocument.positionAt(insertionOffset)

    return this.planFromEdits([{
      uri: document.uri.toString(),
      range: { start: position, end: position },
      newText,
    }])
  }

  async planRenameElement(input: RenameElementInput): Promise<SourceEditPlan> {
    this.assertIdentifier(input.newId)
    const located = this.locateElement(input.target, input.project)
    const parent = parentFqn(input.target)
    const nextFqn = (parent ? `${parent}.${input.newId}` : input.newId) as Fqn
    const collision = this.langium.likec4.likec4.ModelLocator.getParsedElement(nextFqn, located.projectId)
    if (collision && nextFqn !== input.target) {
      throw new DocumentEditError('collision', `Element "${nextFqn}" already exists`)
    }

    const nameNode = this.langium.likec4.references.NameProvider.getNameNode(located.node)
    if (!nameNode) {
      throw new DocumentEditError('not-found', `Declaration range for "${input.target}" was not found`)
    }

    const edits: DocumentTextEdit[] = [{
      uri: located.document.uri.toString(),
      range: nameNode.range,
      newText: input.newId,
    }]
    for (const reference of this.referencesTo(located.node)) {
      edits.push({
        uri: reference.sourceUri.toString(),
        range: reference.segment.range,
        newText: input.newId,
      })
    }
    return this.planFromEdits(edits)
  }

  inspectRemoveElement(input: RemoveElementInput): RemovalDependencyReport {
    const located = this.locateElement(input.target, input.project)
    const dependencies = this.dependencyCandidates(located).map(({ removalEdit: _edit, ...dependency }) => dependency)
    return {
      target: input.target,
      revision: reportRevision(located.document, dependencies),
      dependencies,
    }
  }

  planRemoveElement(input: CascadeRemoveElementInput): SourceEditPlan {
    const located = this.locateElement(input.target, input.project)
    const candidates = this.dependencyCandidates(located)
    const dependencies = candidates.map(({ removalEdit: _edit, ...dependency }) => dependency)
    const report: RemovalDependencyReport = {
      target: input.target,
      revision: reportRevision(located.document, dependencies),
      dependencies,
    }
    const approved = new Set(input.approvedDependencyIds ?? [])

    if (dependencies.length > 0) {
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
    }

    const edits: DocumentTextEdit[] = [this.removalEdit(located.document, located.node)]
    for (const candidate of candidates) {
      if (candidate.removal === 'separate' && candidate.removalEdit && approved.has(candidate.id)) {
        edits.push(candidate.removalEdit)
      }
    }
    return this.planFromEdits(collapseContainedEdits(edits))
  }

  private dependencyCandidates(located: LocatedElement): DependencyCandidate[] {
    const targetRange = this.removalEdit(located.document, located.node).range
    const candidates: DependencyCandidate[] = []

    for (const parsedDocument of this.langium.likec4.likec4.ModelParser.documents(located.projectId)) {
      for (const element of parsedDocument.c4Elements) {
        if (element.id === located.target || !element.id.startsWith(`${located.target}.`)) {
          continue
        }
        const node = this.langium.likec4.workspace.AstNodeLocator.getAstNode(
          parsedDocument.parseResult.value,
          element.astPath,
        )
        if (!node?.$cstNode) {
          continue
        }
        const range = node.$cstNode.range
        candidates.push({
          id: dependencyId('child-element', parsedDocument.uri.toString(), range),
          kind: 'child-element',
          uri: parsedDocument.uri.toString(),
          range,
          removal: 'contained',
        })
      }
    }

    for (const reference of this.referencesTo(located.node)) {
      const sourceDocument = this.langium.shared.workspace.LangiumDocuments.getDocument(reference.sourceUri)
      if (!sourceDocument) {
        continue
      }
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

    return dedupeCandidates(candidates)
  }

  private locateElement(target: Fqn, project?: string): LocatedElement {
    const projectId = this.projectId(project)
    const located = this.langium.likec4.likec4.ModelLocator.getParsedElement(target, projectId)
    if (!located) {
      throw new DocumentEditError('not-found', `Element "${target}" was not found`)
    }
    const node = this.langium.likec4.workspace.AstNodeLocator.getAstNode(
      located.document.parseResult.value,
      located.element.astPath,
    )
    if (!node?.$cstNode) {
      throw new DocumentEditError('not-found', `Source range for "${target}" was not found`)
    }
    return { target, projectId: located.projectId, document: located.document, node }
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
    const source = document.textDocument.getText()
    let start = cst.offset
    let end = cst.end
    const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    if (/^[\t ]*$/.test(source.slice(lineStart, start))) {
      start = lineStart
    }
    const lineEnd = source.indexOf('\n', end)
    if (lineEnd >= 0 && /^[\t ]*$/.test(source.slice(end, lineEnd))) {
      end = lineEnd + 1
    }
    return {
      uri: document.uri.toString(),
      range: {
        start: document.textDocument.positionAt(start),
        end: document.textDocument.positionAt(end),
      },
      newText: '',
    }
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

function classifyDependency(node: AstNode | undefined): RemovalDependencyKind {
  let current = node
  const containerProperties = new Set<string>()
  while (current) {
    if (current.$containerProperty) {
      containerProperties.add(current.$containerProperty)
    }
    const type = current.$type
    if (type.includes('Relation')) {
      if (containerProperties.has('source')) {
        return 'outgoing-relation'
      }
      if (containerProperties.has('target')) {
        return 'incoming-relation'
      }
      return 'semantic-reference'
    }
    if (type === 'ElementView') {
      return containerProperties.has('viewOf') ? 'scoped-view' : 'view-reference'
    }
    if (type.includes('View') || type.includes('Rule') || type.includes('Predicate')) {
      return 'view-reference'
    }
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

function reportRevision(document: LangiumDocument, dependencies: readonly RemovalDependency[]): string {
  return sourceRevision(
    `${document.uri.toString()}\n${sourceRevision(document.textDocument.getText())}\n${
      dependencies.map(d => d.id).join('\n')
    }`,
  )
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

function dedupeCandidates(candidates: readonly DependencyCandidate[]): DependencyCandidate[] {
  const byId = new Map<string, DependencyCandidate>()
  for (const candidate of candidates) {
    byId.set(candidate.id, candidate)
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function normalizeEdits(edits: readonly DocumentTextEdit[]): DocumentTextEdit[] {
  const normalized = [...edits].sort((left, right) => {
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
  if (position.line < 0 || position.character < 0) {
    return -1
  }
  let line = 0
  let offset = 0
  while (line < position.line && offset < source.length) {
    const next = source.indexOf('\n', offset)
    if (next < 0) {
      return source.length
    }
    offset = next + 1
    line++
  }
  return Math.min(source.length, offset + position.character)
}
