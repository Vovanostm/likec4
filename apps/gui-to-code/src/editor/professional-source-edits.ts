import type { Fqn } from '@likec4/core/types'
import {
  applyDocumentTextEdits,
  createDocumentEditService,
  DocumentEditError,
  fromSources,
} from '@likec4/language-services/browser'
import type { DocumentEditErrorCode } from '@likec4/language-services/browser'
import type { SourceFile } from './contracts'
import { EditorDocumentError } from './contracts'
import type { PasteSubgraphPlan } from './professional-clipboard'

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

export interface ProfessionalSourceEditPort {
  createSubgraph(sources: readonly SourceFile[], plan: PasteSubgraphPlan): Promise<readonly SourceFile[]>
}

function sourceKey(uri: string): string {
  const virtualPrefix = 'virtual:/workspace/'
  return uri.startsWith(virtualPrefix) ? uri.slice(virtualPrefix.length) : uri
}

function applyPlan(sources: readonly SourceFile[], plan: ApplicableEditPlan): readonly SourceFile[] {
  const byKey = new Map(sources.map(source => [source.uri, source]))
  for (const uri of Object.keys(plan.baseRevisions)) {
    if (!byKey.has(sourceKey(uri))) {
      throw new EditorDocumentError('not-found', `Source document ${sourceKey(uri)} is unavailable`)
    }
  }
  return sources.map(source => {
    const planUri = Object.keys(plan.baseRevisions).find(uri => sourceKey(uri) === source.uri)
    if (!planUri) return source
    const revision = plan.baseRevisions[planUri]
    const edits = plan.edits.filter(edit => edit.uri === planUri)
    if (!revision) return source
    return {
      ...source,
      content: applyDocumentTextEdits(source.content, edits, revision),
    }
  })
}

function documentError(error: unknown): never {
  if (error instanceof EditorDocumentError) throw error
  if (error instanceof DocumentEditError) {
    throw new EditorDocumentError(error.code as DocumentEditErrorCode, error.message)
  }
  throw new EditorDocumentError('unknown', error instanceof Error ? error.message : String(error))
}

async function documentsFor(sources: readonly SourceFile[]) {
  const likec4 = await fromSources(Object.fromEntries(sources.map(source => [source.uri, source.content])))
  return createDocumentEditService(likec4)
}

export const professionalSourceEditPort: ProfessionalSourceEditPort = {
  async createSubgraph(sources, plan) {
    try {
      let candidate = sources
      for (const element of plan.elements) {
        let documents = await documentsFor(candidate)
        candidate = applyPlan(candidate, await documents.planAddElement({
          id: element.id,
          kind: element.kind,
          title: element.title,
          documentUri: plan.documentUri,
        }))

        const patch = {
          ...(element.description ? { description: element.description } : {}),
          ...(element.technology ? { technology: element.technology } : {}),
          ...(element.tags.length > 0 ? { tags: element.tags } : {}),
        }
        if (Object.keys(patch).length > 0) {
          documents = await documentsFor(candidate)
          candidate = applyPlan(candidate, await documents.planPatchElement({
            target: element.id as Fqn,
            patch,
          }))
        }

        if (element.parentId) {
          documents = await documentsFor(candidate)
          candidate = applyPlan(candidate, await documents.planMoveElement({
            target: element.id as Fqn,
            parent: element.parentId,
          }))
        }
      }

      for (const relation of plan.relations) {
        const documents = await documentsFor(candidate)
        candidate = applyPlan(candidate, await documents.planAddRelation({
          source: relation.sourceId,
          target: relation.targetId,
          documentUri: plan.documentUri,
        }))
      }
      return candidate
    } catch (error) {
      return documentError(error)
    }
  },
}
