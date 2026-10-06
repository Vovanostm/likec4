import type { Fqn } from '@likec4/core/types'
import { fromSources } from '@likec4/language-services/browser'
import type { SourceFile } from './contracts'
import { workspaceSourceUri } from './source-documents'
import type { SourceLocation } from './source-documents'

/** Use the compiler's exact declaration locator, including elements defined in cross-file extensions. */
export async function locateElementSource(
  sources: readonly SourceFile[],
  element: Fqn,
): Promise<SourceLocation | null> {
  const service = await fromSources(Object.fromEntries(sources.map(source => [source.uri, source.content])))
  try {
    if (service.hasErrors()) return null
    const location = service.languageServices.locate({ element })
    if (!location) return null
    const uri = workspaceSourceUri(location.uri, sources)
    return uri ? { uri, range: location.range } : null
  } finally {
    await service.dispose()
  }
}
