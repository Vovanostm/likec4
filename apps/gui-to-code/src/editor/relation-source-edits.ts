import type { Fqn } from '@likec4/core/types'
import type { SourceFile } from './contracts'
import { EditorDocumentError } from './contracts'

export interface LogicalRelationLocator {
  readonly sourceId: Fqn
  readonly targetId: Fqn
  readonly occurrence: number
  readonly documentUri?: string
}

export function patchLogicalRelationTitle(
  sources: readonly SourceFile[],
  locator: LogicalRelationLocator,
  title: string,
): readonly SourceFile[] {
  const normalized = title.trim()
  if (!normalized) throw new EditorDocumentError('invalid-title', 'Relation title must not be empty')
  const match = locateRelation(sources, locator)
  const source = match.source.content
  const declaration = source.slice(match.start, match.end)
  const quoted = findTitleQuote(declaration)
  const replacement = quoted
    ? `${declaration.slice(0, quoted.start)}${escapeSingleQuoted(normalized)}${declaration.slice(quoted.end)}`
    : insertPositionalTitle(declaration, normalized)
  return replaceSourceRange(sources, match.source.uri, match.start, match.end, replacement)
}

export function removeLogicalRelation(
  sources: readonly SourceFile[],
  locator: LogicalRelationLocator,
): readonly SourceFile[] {
  const match = locateRelation(sources, locator)
  let end = match.end
  const content = match.source.content
  if (content[end] === '\r' && content[end + 1] === '\n') end += 2
  else if (content[end] === '\n') end += 1
  return replaceSourceRange(sources, match.source.uri, match.start, end, '')
}

interface RelationMatch {
  readonly source: SourceFile
  readonly start: number
  readonly end: number
}

function locateRelation(sources: readonly SourceFile[], locator: LogicalRelationLocator): RelationMatch {
  if (!Number.isInteger(locator.occurrence) || locator.occurrence < 0) {
    throw new EditorDocumentError('invalid-operation', 'Relation occurrence must be a non-negative integer')
  }
  let occurrence = 0
  for (const source of sources) {
    if (locator.documentUri && source.uri !== locator.documentUri) continue
    for (const match of scanRelations(source)) {
      if (match.sourceId !== locator.sourceId || match.targetId !== locator.targetId) continue
      if (occurrence === locator.occurrence) return match
      occurrence += 1
    }
  }
  throw new EditorDocumentError('not-found', `Relation "${locator.sourceId} -> ${locator.targetId}" was not found`)
}

function scanRelations(source: SourceFile): readonly (RelationMatch & { sourceId: Fqn; targetId: Fqn })[] {
  const result: (RelationMatch & { sourceId: Fqn; targetId: Fqn })[] = []
  const text = source.content
  const linePattern = /^[\t ]*([@A-Za-z_][\w@.-]*)[\t ]*->[\t ]*([@A-Za-z_][\w@.-]*)(?=[\t ]|'|\{|\/\/|\/\*|$)/gm
  for (const match of text.matchAll(linePattern)) {
    const start = match.index
    if (start === undefined || insideCommentOrString(text, start)) continue
    const lineEnd = endOfLine(text, start)
    const end = declarationEnd(text, start, lineEnd)
    result.push({
      source,
      start,
      end,
      sourceId: match[1] as Fqn,
      targetId: match[2] as Fqn,
    })
  }
  return result
}

function declarationEnd(text: string, start: number, lineEnd: number): number {
  const opening = firstStructuralBrace(text, start, lineEnd)
  if (opening < 0) return lineEnd
  let depth = 0
  let quote: "'" | '"' | null = null
  let escaped = false
  let lineComment = false
  let blockComment = false
  for (let index = opening; index < text.length; index += 1) {
    const char = text[index]!
    const next = text[index + 1]
    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = null
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    if (char === '}' && --depth === 0) return index + 1
  }
  throw new EditorDocumentError('invalid-operation', 'Relation block is not closed')
}

function firstStructuralBrace(text: string, start: number, end: number): number {
  let quote: "'" | '"' | null = null
  let escaped = false
  for (let index = start; index < end; index += 1) {
    const char = text[index]!
    const next = text[index + 1]
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = null
      continue
    }
    if (char === '/' && (next === '/' || next === '*')) return -1
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === '{') return index
  }
  return -1
}

function findTitleQuote(declaration: string): { start: number; end: number } | null {
  const headerEnd = endOfLine(declaration, 0)
  const header = declaration.slice(0, headerEnd)
  const endpoint = /^[\t ]*[@A-Za-z_][\w@.-]*[\t ]*->[\t ]*[@A-Za-z_][\w@.-]*/.exec(header)
  if (!endpoint) return null
  const positional = /^[\t ]*'((?:\\.|[^'])*)'/.exec(header.slice(endpoint[0].length))
  if (positional) {
    const quoteStart = endpoint[0].length + positional[0].indexOf("'") + 1
    return { start: quoteStart, end: quoteStart + positional[1]!.length }
  }
  const bodyTitle = /(^|\n)([\t ]*)title[\t ]+'((?:\\.|[^'])*)'/.exec(declaration)
  if (!bodyTitle || bodyTitle.index === undefined) return null
  const titleOffset = bodyTitle[0].lastIndexOf(bodyTitle[3]!)
  const start = bodyTitle.index + titleOffset
  return { start, end: start + bodyTitle[3]!.length }
}

function insertPositionalTitle(declaration: string, title: string): string {
  const lineEnd = endOfLine(declaration, 0)
  const header = declaration.slice(0, lineEnd)
  const brace = firstStructuralBrace(header, 0, header.length)
  const comment = header.search(/\/\/|\/\*/)
  const insertion = [brace, comment].filter(index => index >= 0).reduce((left, right) => Math.min(left, right), header.length)
  const before = header.slice(0, insertion).replace(/[\t ]+$/, '')
  const spacing = header.slice(before.length, insertion)
  return `${before} '${escapeSingleQuoted(title)}'${spacing}${declaration.slice(insertion)}`
}

function replaceSourceRange(
  sources: readonly SourceFile[],
  uri: string,
  start: number,
  end: number,
  replacement: string,
): readonly SourceFile[] {
  return sources.map(source => source.uri === uri
    ? { ...source, content: `${source.content.slice(0, start)}${replacement}${source.content.slice(end)}` }
    : source)
}

function endOfLine(text: string, start: number): number {
  const newline = text.indexOf('\n', start)
  return newline < 0 ? text.length : newline
}

function escapeSingleQuoted(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")
}

function insideCommentOrString(text: string, offset: number): boolean {
  let quote: "'" | '"' | null = null
  let escaped = false
  let lineComment = false
  let blockComment = false
  for (let index = 0; index < offset; index += 1) {
    const char = text[index]!
    const next = text[index + 1]
    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = null
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }
    if (char === "'" || char === '"') quote = char
  }
  return quote !== null || lineComment || blockComment
}
