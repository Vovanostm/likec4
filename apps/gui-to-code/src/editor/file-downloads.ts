import type { ViewManualLayoutSnapshot } from '@likec4/core/types'
import { serializeSnapshot, snapshotFileName } from './layout-snapshots'

export function downloadSource(source: string): void {
  downloadText('model.c4', source, 'text/plain')
}

export function downloadLayout(snapshot: ViewManualLayoutSnapshot): void {
  downloadText(snapshotFileName(snapshot.id), serializeSnapshot(snapshot), 'application/json')
}

function downloadText(fileName: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
