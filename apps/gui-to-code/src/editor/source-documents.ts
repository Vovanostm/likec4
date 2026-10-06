import type { SourceFile } from './contracts'

export interface SourcePosition {
  readonly line: number
  readonly character: number
}

export interface SourceLocation {
  readonly uri: string
  readonly range: { readonly start: SourcePosition; readonly end: SourcePosition }
}

/** Resolve compiler-owned virtual URIs or diagnostic paths against the exact workspace file set. */
export function workspaceSourceUri(value: string, sources: readonly SourceFile[]): string | null {
  let candidate = value
  if (value.startsWith('virtual:/workspace/')) {
    try {
      candidate = decodeURIComponent(value.slice('virtual:/workspace/'.length))
    } catch {
      return null
    }
  } else if (value.startsWith('/workspace/')) {
    candidate = value.slice('/workspace/'.length)
  }
  return sources.some(source => source.uri === candidate) ? candidate : null
}

export function reconcileSourceDocument(
  preferred: string | null,
  sources: readonly SourceFile[],
  entryDocumentUri: string,
): string {
  if (preferred && sources.some(source => source.uri === preferred)) return preferred
  return sources.find(source => source.uri === entryDocumentUri)?.uri ?? sources[0]?.uri ?? entryDocumentUri
}

export function sourcePositionOffset(content: string, position: SourcePosition): number {
  const lines = content.split('\n')
  const line = Math.min(Math.max(position.line, 0), lines.length - 1)
  const preceding = lines.slice(0, line).reduce((length, text) => length + text.length + 1, 0)
  return preceding + Math.min(Math.max(position.character, 0), lines[line]?.length ?? 0)
}

/** Native textareas normalize CRLF; keep a consistently CRLF-authored document's existing convention. */
export function sourceWithOriginalLineEndings(original: string, edited: string): string {
  return original.includes('\r\n') && !original.replace(/\r\n/g, '').includes('\n')
    ? edited.replace(/\r?\n/g, '\r\n')
    : edited
}

/** File-navigation preference is tab-local, separate from the workspace's portable entry metadata. */
export function readPreferredDocument(projectId: string): string | null {
  try {
    return sessionStorage.getItem(`likec4.gui.document.${projectId}`)
  } catch {
    return null
  }
}

export function rememberDocument(projectId: string, uri: string): void {
  try {
    sessionStorage.setItem(`likec4.gui.document.${projectId}`, uri)
  } catch { /* Optional navigation preference. */ }
}
