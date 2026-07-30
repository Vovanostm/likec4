import {
  applyDocumentTextEdits,
  createDocumentEditService,
  fromSources,
} from '@likec4/language-services/browser'
import type { ElementEditPort } from './contracts'

export const editElementWithLanguageServices: ElementEditPort = async (sources, input) => {
  const likec4 = await fromSources(Object.fromEntries(sources.map(source => [source.uri, source.content])))
  const plan = await createDocumentEditService(likec4).planAddElement({
    id: input.id,
    kind: input.kind,
    ...(input.title ? { title: input.title } : {}),
  })

  return sources.map(source => {
    const revision = plan.baseRevisions[source.uri]
    const edits = plan.edits.filter(edit => edit.uri === source.uri)
    if (!revision || edits.length === 0) return source
    return {
      ...source,
      content: applyDocumentTextEdits(source.content, edits, revision),
    }
  })
}
