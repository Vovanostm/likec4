import type { ElementKind, Fqn, ProjectId } from '@likec4/core/types'
import type { AstNode, CstNode, LangiumDocument, ReferenceDescription } from 'langium'
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
  readonly projectId: ProjectId
  readonly document: LangiumDocument
  readonly node: AstNode
}

interface DependencyCandidate extends RemovalDependency {
  readonly removalEdit?: DocumentTextEdit
}

const ID_PATTERN = /^([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*$/

/**
 * Browser-compatible, source-preserving edit planner backed by linked Langium documents.
 *
 * Plans are immutable and revision-bound. Applying a plan is intentionally left to
 * the caller so candidate source can be compiled before commit.
 */
export class DocumentEditService {
  private readonly langium: LikeC4Langium

  constructor(langium: LikeC4Langium) {
    this.langium = langium
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
    const model = root.models?.[0]
    const modelCst = model?.$cstNode
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

    return this.planFromEdits(document, [{
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

    const references = this.referencesTo(located.node)
    for (const reference of references) {
      edits.push({
        uri: reference.sourceUri.toString(),
        range: reference.segment.range,
        newText: input.newId,
      })
    }

    return this.planFromWorkspaceEdits(edits)
  }

  inspectRemoveElement(input: RemoveElementInput): RemovalDependencyReport {
    const located = this.locateElement(input.target, input.project)
    const targetRange = this.removalRange(located.document, located.node)
    const candidates: DependencyCandidate[] = []

    for (const parsedDocument of this.langium.likec4.likec4.ModelParser.documents(located.projectId)) {
      for (const element of parsedDocument.c4Elements) {
        if (element.id === input.target || !element.id.startsWith(`${input.target}.`)) {
          continue
        }
        const node = this.langium.likec4.workspace.AstNodeLocator.getAstNode(
          parsedDocument.parseResult.value,
          element.astPath,
        )
        const range = node?.$cstNode?.range
        if (!node || !range) {
          continue
        }
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
      const property = sourceNode ? findReferenceProperty(sourceNode, reference.segment.range) : undefined
      const kind = classifyDependency(sourceNode, property)
      const removableNode = sourceNode ? findRemovableAncestor(sourceNode, kind) : undefined
      const removalEdit = removableNode?.$cstNode
        ? this.removalEdit(sourceDocument, removableNode)
        : undefined
      const referenceRange = reference.segment.range
      const isContained = sourceDocument.uri.toString() === located.document.uri.toString()
        && rangeContains(targetRange, referenceRange)

      candidates.push({
        id: dependencyId(kind, sourceDocument.uri.toString(), referenceRange),
        kind,
        uri: sourceDocument.uri.toString(),
        range: referenceRange,
        removal: isContained ? 'contained' : removalEdit ? 'separate' : 'unsupported',
        ...(!isContained && removalEdit ? { removalEdit } : {}),
      })
    }

    const dependencies = dedupeDependencies(candidates)
    return {
      target: input.target,
      revision: reportRevision(located.document, dependencies),
      dependencies,
    }
  }

  planRemoveElement(input: CascadeRemoveElementInput): SourceEditPlan {
    const located = this.locateElement(input.target, input.project)
    const report = this.inspectRemoveElement(input)
    const approved = new Set(input.approvedDependencyIds ?? [])

    if (report.dependencies.length > 0) {
      if (input.dependencyRevision !== report.revision) {
        throw new DocumentEditError(
          'stale-document',
          'Removal dependencies changed; inspect them again before approving cascade removal',
          report,
        )
      }
      const missing = report.dependencies.filter(dependency => !approved.has(dependency.id))
      const unknown = [...approved].filter(id => !report.dependencies.some(dependency => dependency.id === id))
      if (missing.length > 0 || unknown.length > 0) {
        throw new DocumentEditError(
          'dependencies-not-approved',
          'Every current dependency must be approved explicitly',
          report,
        )
      }
      const unsupported = report.dependencies.filter(dependency => dependency.removal === 'unsupported')
      if (unsupported.length > 0) {
        throw new DocumentEditError(
          'unsupported-cascade',
          'At least one dependency cannot be removed safely by the current source-preserving planner',
          report,
        )
      }
    }

    const edits: DocumentTextEdit[] = [this.removalEdit(located.document, located.node)]
    const candidates = this.inspectDependencyCandidates(located)
    for (const candidate of candidates) {
      if (candidate.removal === 'separate' && candidate.removalEdit && approved.has(candidate.id)) {
        edits.push(candidate.removalEdit)
      }
    }

    return this.planFromWorkspaceEdits(collapseContainedEdits(edits))
  }

  private inspectDependencyCandidates(located: LocatedElement): readonly DependencyCandidate[] {
    const report = this.inspectRemoveElement({ target: this.elementFqn(located), project: located.projectId })
    const result: DependencyCandidate[] = []
    for (const dependency of report.dependencies) {
      if (dependency.removal !== 'separate') {
        result.push(dependency)
        continue
      }
      const document = this.langium.shared.workspace.LangiumDocuments.getDocument(URI.parse(dependency.uri))
      if (!document) {
        result.push({ ...dependency, removal: 'unsupported' })
        continue
      }
      const reference = this.referencesTo(located.node).find(candidate => {
        return candidate.sourceUri.toString() === dependency.uri
          && rangesEqual(candidate.segment.range, dependency.range)
      })
      const sourceNode = reference
        ? this.langium.likec4.workspace.AstNodeLocator.getAstNode(document.parseResult.value, reference.sourcePath)
        : undefined
      const removable = sourceNode ? findRemovableAncestor(sourceNode, dependency.kind) : undefined
      result.push({
        ...dependency,
        ...(removable ? { removalEdit: this.removalEdit(document, removable) } : { removal: 'unsupported' as const }),
      })
    }
    return result
  }

  private elementFqn(located: LocatedElement): Fqn {
    const parsed = this.langium.likec4.likec4.ModelLocator.getParsedElement(located.node as never)
    if (!parsed) {
      throw new DocumentEditError('not-found', 'Element is no longer available')
    }
    return parsed.element.id
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
    return {
      projectId: located.projectId,
      document: located.document,
      node,
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

  private removalRange(document: LangiumDocument, node: AstNode): Range {
    return this.removalEdit(document, node).range
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

  private planFromEdits(document: LangiumDocument, edits: readonly DocumentTextEdit[]): SourceEditPlan {
    return {
      baseRevisions: { [document.uri.toString()]: sourceRevision(document.textDocument.getText()) },
      edits: normalizeEdits(edits),
      affectedDocuments: [document.uri.toString()],
    }
  }

  private planFromWorkspaceEdits(edits: readonly DocumentTextEdit[]): SourceEditPlan {
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

/** Create the public edit planner for a LikeC4 browser or Node instance. */
export function createDocumentEditService(likec4: LikeC4): DocumentEditService {
  const langium = (likec4 as unknown as { readonly langium: LikeC4Langium }).langium
  return new DocumentEditService(langium)
}

/** Stable revision digest used to reject stale plans without Node crypto APIs. */
export function sourceRevision(source: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}:${source.length}`
}

/** Apply one document's plan after checking the exact source revision. */
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

function reportRevision(document: LangiumDocument, dependencies: readonly RemovalDependency[]): string {
  return sourceRevision(`${document.uri.toString()}\n${sourceRevision(document.textDocument.getText())}\n${dependencies.map(d => d.id).join('\n')}`)
}

function parentFqn(fqn: Fqn): string | undefined {
  const index = fqn.lastIndexOf('.')
  return index < 0 ? undefined : fqn.slice(0, index)
}

function escapeSingleQuoted(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
}

function dependencyId(kind: RemovalDependencyKind, uri: string, range: Range): string {
  return `${kind}:${uri}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`
}

function dedupeDependencies(candidates: readonly DependencyCandidate[]): RemovalDependency[] {
  const byId = new Map<string, RemovalDependency>()
  for (const candidate of candidates) {
    const { removalEdit: _removalEdit, ...dependency } = candidate
    byId.set(candidate.id, dependency)
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function classifyDependency(node: AstNode | undefined, property: string | undefined): RemovalDependencyKind {
  let current = node
  while (current) {
    const type = current.$type
    if (type.includes('Relation')) {
      if (property === 'source') {
        return 'outgoing-relation'
      }
      if (property === 'target') {
        return 'incoming-relation'
      }
      return 'semantic-reference'
    }
    if ((type === 'ElementView' || type.endsWith('View')) && property === 'viewOf') {
      return 'scoped-view'
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
      (kind === 'incoming-relation' || kind === 'outgoing-relation') && type.includes('Relation')
      || kind === 'scoped-view' && (type === 'ElementView' || type.endsWith('View'))
      || kind === 'view-reference' && (type.includes('Rule') || type.includes('Predicate'))
    ) {
      return current
    }
    current = current.$container
  }
  return undefined
}

function findReferenceProperty(node: AstNode, targetRange: Range): string | undefined {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) {
      continue
    }
    const values = Array.isArray(value) ? value : [value]
    for (const candidate of values) {
      if (
        candidate
        && typeof candidate === 'object'
        && '$refNode' in candidate
        && rangesEqual((candidate as { $refNode?: CstNode }).$refNode?.range, targetRange)
      ) {
        return key
      }
    }
  }
  return undefined
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

function rangesEqual(left: Range | undefined, right: Range | undefined): boolean {
  return !!left && !!right
    && comparePositions(left.start, right.start) === 0
    && comparePositions(left.end, right.end) === 0
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
