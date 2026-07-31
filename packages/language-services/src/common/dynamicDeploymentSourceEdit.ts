import type { Fqn } from '@likec4/core/types'
import type { AstNode, DocumentSegment, LangiumDocument } from 'langium'
import { AstUtils } from 'langium'
import { DocumentEditError, type DocumentTextEdit } from './DocumentEditService'

interface LikeC4Root extends AstNode {
  readonly views?: readonly AstNode[]
  readonly deployments?: readonly AstNode[]
}

export function createDynamicViewEdit(
  document: LangiumDocument,
  id: string,
  title?: string,
): DocumentTextEdit {
  return insertView(document, `dynamic view ${id}`, title, [])
}

export function createDeploymentViewEdit(
  document: LangiumDocument,
  id: string,
  title?: string,
): DocumentTextEdit {
  return insertView(document, `deployment view ${id}`, title, ['include *'])
}

export function createDynamicStepEdit(
  document: LangiumDocument,
  viewId: string,
  source: Fqn,
  target: Fqn,
): DocumentTextEdit {
  const view = findNamedNode(document, 'DynamicView', viewId)
  return insertStatement(document, view, `${source} -> ${target}`)
}

export function createDeploymentNodeEdit(
  document: LangiumDocument,
  id: string,
  kind: string,
  title?: string,
): DocumentTextEdit {
  const declaration = `${kind} ${id}${title?.trim() ? ` '${escapeTitle(title.trim())}'` : ''}`
  return insertDeploymentStatement(document, declaration)
}

export function createDeploymentInstanceEdit(
  document: LangiumDocument,
  id: string,
  target: Fqn,
): DocumentTextEdit {
  return insertDeploymentStatement(document, `${id} = instanceOf ${target}`)
}

export function createDeploymentRelationEdit(
  document: LangiumDocument,
  source: Fqn,
  target: Fqn,
): DocumentTextEdit {
  return insertDeploymentStatement(document, `${source} -> ${target}`)
}

function insertView(
  document: LangiumDocument,
  header: string,
  title: string | undefined,
  statements: readonly string[],
): DocumentTextEdit {
  const root = document.parseResult.value as LikeC4Root
  const viewsSegment = root.views?.[0]?.$cstNode
  const declaration = blockDeclaration(header, title, statements, '  ')
  if (viewsSegment) {
    return insertBeforeClosing(document, viewsSegment, declaration)
  }
  return appendRootBlock(document, root, `views {\n${declaration}\n}`)
}

function insertDeploymentStatement(document: LangiumDocument, statement: string): DocumentTextEdit {
  const root = document.parseResult.value as LikeC4Root
  const deployment = findFirstNode(document, 'ModelDeployments')
  if (deployment) {
    return insertStatement(document, deployment, statement)
  }
  return appendRootBlock(document, root, `deployment {\n  ${statement}\n}`)
}

function insertStatement(document: LangiumDocument, node: AstNode, statement: string): DocumentTextEdit {
  const segment = node.$cstNode
  if (!segment) {
    throw new DocumentEditError('not-found', 'LikeC4 source range was not found')
  }
  const indent = `${lineIndent(document.textDocument.getText(), segment.offset)}  `
  return insertBeforeClosing(document, segment, `${indent}${statement}`)
}

function insertBeforeClosing(
  document: LangiumDocument,
  segment: DocumentSegment,
  declaration: string,
): DocumentTextEdit {
  const offset = segment.end - 1
  const position = document.textDocument.positionAt(offset)
  return {
    uri: document.uri.toString(),
    range: { start: position, end: position },
    newText: `\n${declaration}\n${lineIndent(document.textDocument.getText(), segment.offset)}`,
  }
}

function appendRootBlock(document: LangiumDocument, root: AstNode, block: string): DocumentTextEdit {
  const segment = root.$cstNode
  if (!segment) {
    throw new DocumentEditError('not-found', 'LikeC4 document source range was not found')
  }
  const source = document.textDocument.getText()
  const position = document.textDocument.positionAt(segment.end)
  const prefix = segment.end > 0 && source[segment.end - 1] !== '\n' ? '\n\n' : '\n'
  return {
    uri: document.uri.toString(),
    range: { start: position, end: position },
    newText: `${prefix}${block}\n`,
  }
}

function blockDeclaration(
  header: string,
  title: string | undefined,
  statements: readonly string[],
  indent: string,
): string {
  const childIndent = `${indent}  `
  return [
    `${indent}${header} {`,
    ...(title?.trim() ? [`${childIndent}title '${escapeTitle(title.trim())}'`] : []),
    ...statements.map(statement => `${childIndent}${statement}`),
    `${indent}}`,
  ].join('\n')
}

function findNamedNode(document: LangiumDocument, type: string, name: string): AstNode {
  const match = [...AstUtils.streamAllContents(document.parseResult.value)]
    .find(node => node.$type === type && (node as AstNode & { readonly name?: string }).name === name)
  if (!match) {
    throw new DocumentEditError('not-found', `${type} "${name}" was not found`)
  }
  return match
}

function findFirstNode(document: LangiumDocument, type: string): AstNode | undefined {
  return [...AstUtils.streamAllContents(document.parseResult.value)].find(node => node.$type === type)
}

function lineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  return source.slice(lineStart, offset).match(/^\s*/)?.[0] ?? ''
}

function escapeTitle(value: string): string {
  return value.split('\\').join('\\\\').split('\'').join('\\\'')
}
