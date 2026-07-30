export interface TextEdit {
  start: number
  end: number
  text: string
}

export function applyTextEdits(source: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((left, right) => right.start - left.start)
  let previousStart = source.length
  let result = source
  for (const edit of sorted) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > source.length || edit.end > previousStart) {
      throw new Error('Source edits must be valid and non-overlapping.')
    }
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`
    previousStart = edit.start
  }
  return result
}

export function identifierEdits(source: string, ranges: readonly { start: number; end: number }[], nextId: string): TextEdit[] {
  return ranges.map(range => ({ ...range, text: nextId }))
}

export function inspectRemoval(dependencyRanges: readonly { start: number; end: number }[]) {
  return dependencyRanges.length === 0
    ? { status: 'safe' as const }
    : { status: 'blocked' as const, dependencies: dependencyRanges }
}
