import type { Fqn } from '@likec4/core/types'
import type { AstNode, DocumentSegment, LangiumDocument } from 'langium'
import { DocumentEditError, type DocumentTextEdit } from './DocumentEditService'

interface LikeC4Root extends AstNode {
  readonly views?: readonly AstNode[]
}

export function createElementViewEdit(
  document: LangiumDocument,
  id: string,
  viewOf: Fqn,
  title?: string,
): DocumentTextEdit {
  const root = document.parseResult.value as LikeC4Root
  const viewsSegment = root.views?.[0]?.$cstNode
  if (viewsSegment) {
    return insertBeforeClosingBrace(document, viewsSegment, id, viewOf, title)
  }
  return appendViewsBlock(document, root, id, viewOf, title)
}

function viewDeclaration(id: string, viewOf: Fqn, title: string | undefined, indent: string): string {
  const childIndent = `${indent}  `
  return [
    `${indent}view ${id} of ${viewOf} {`,
    ...(title?.trim() ? [`${childIndent}title '${escapeTitle(title.trim())}'`] : []),
    `${childIndent}include *`,
    `${indent}}`,
  ].join('\n')
}

function insertBeforeClosingBrace(
  document: LangiumDocument,
  segment: DocumentSegment,
  id: string,
  viewOf: Fqn,
  title?: string,
): DocumentTextEdit {
  const offset = segment.end - 1
  const position = document.textDocument.positionAt(offset)
  return {
    uri: document.uri.toString(),
    range: { start: position, end: position },
    newText: `\n${viewDeclaration(id, viewOf, title, '  ')}\n`,
  }
}

function appendViewsBlock(
  document: LangiumDocument,
  root: LikeC4Root,
  id: string,
  viewOf: Fqn,
  title?: string,
): DocumentTextEdit {
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
    newText: `${prefix}views {\n${viewDeclaration(id, viewOf, title, '  ')}\n}\n`,
  }
}

function escapeTitle(value: string): string {
  return value.split('\\').join('\\\\').split('\'').join('\\\'')
}
