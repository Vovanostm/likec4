import {
  applyDocumentTextEdits,
  createDocumentEditService,
  fromSources,
} from '@likec4/language-services/browser'
import type { ElementEditPort, RelationEditPort, SourceFile } from './contracts'

interface ApplicableEditPlan {
  readonly baseRevisions: Readonly<Record<string, string>>
  readonly edits: readonly {
    readonly uri: string
    readonly range: {
      readonly start: { readonly line: number; readonly character: number }
      readonly end: { readonly line: number; readonly character: number }
    }
    readonly newText: string
  }[]
}

function applyPlan(sources: readonly SourceFile[], plan: ApplicableEditPlan): readonly SourceFile[] {
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

export const editElementWithLanguageServices: ElementEditPort = async (sources, input) => {
  const likec4 = await fromSources(Object.fromEntries(sources.map(source => [source.uri, source.content])))
  const plan = await createDocumentEditService(likec4).planAddElement({
    id: input.id,
    kind: input.kind,
    ...(input.title ? { title: input.title } : {}),
    ...(input.documentUri ? { documentUri: input.documentUri } : {}),
  })
  return applyPlan(sources, plan)
}

export const editRelationWithLanguageServices: RelationEditPort = async (sources, input) => {
  const likec4 = await fromSources(Object.fromEntries(sources.map(source => [source.uri, source.content])))
  const plan = await createDocumentEditService(likec4).planAddRelation({
    source: input.sourceId,
    target: input.targetId,
    ...(input.documentUri ? { documentUri: input.documentUri } : {}),
  })
  return applyPlan(sources, plan)
}
