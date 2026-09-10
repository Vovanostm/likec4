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
import type { MultiRemovalInspection } from './professional-removal'
import { patchLogicalRelationTitle } from './relation-source-edits'

interface ApplicableTextEdit {
  readonly uri: string
  readonly range: {
    readonly start: { readonly line: number; readonly character: number }
    readonly end: { readonly line: number; readonly character: number }
  }
  readonly newText: string
}

interface ApplicableEditPlan {
  readonly baseRevisions: Readonly<Record<string, string>>
  readonly edits: readonly ApplicableTextEdit[]
}

export interface ProfessionalSourceEditPort {
  createSubgraph(sources: readonly SourceFile[], plan: PasteSubgraphPlan): Promise<readonly SourceFile[]>
  removeSubgraph?(sources: readonly SourceFile[], inspection: MultiRemovalInspection): Promise<readonly SourceFile[]>
}

const virtualPrefix = 'virtual:/workspace/'

function sourceKey(uri: string): string {
  return uri.startsWith(virtualPrefix) ? uri.slice(virtualPrefix.length) : uri
}

function plannerDocumentUri(uri: string): string {
  return uri.startsWith(virtualPrefix) ? uri : `${virtualPrefix}${uri.replace(/^\/+/, '')}`
}

function localElementId(id: Fqn): Fqn {
  const separator = id.lastIndexOf('.')
  return (separator < 0 ? id : id.slice(separator + 1)) as Fqn
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

function offsetAt(source: string, position: { readonly line: number; readonly character: number }): number {
  if (position.line < 0 || position.character < 0) return -1
  let offset = 0
  for (let line = 0; line < position.line; line += 1) {
    const newline = source.indexOf('\n', offset)
    if (newline < 0) return -1
    offset = newline + 1
  }
  return offset + position.character
}

interface PositionedEdit {
  readonly edit: ApplicableTextEdit
  readonly start: number
  readonly end: number
}

function mergeRemovalEdits(source: SourceFile, edits: readonly ApplicableTextEdit[]): readonly ApplicableTextEdit[] {
  const positioned = edits.map(edit => ({
    edit,
    start: offsetAt(source.content, edit.range.start),
    end: offsetAt(source.content, edit.range.end),
  })).sort((left, right) => left.start - right.start || right.end - left.end)

  const kept: PositionedEdit[] = []
  for (const candidate of positioned) {
    if (candidate.start < 0 || candidate.end < candidate.start || candidate.end > source.content.length) {
      throw new EditorDocumentError('invalid-operation', 'Removal plan contains an invalid source range')
    }
    const containing = kept.find(existing => existing.start <= candidate.start && existing.end >= candidate.end)
    if (containing) {
      if (
        containing.start === candidate.start
        && containing.end === candidate.end
        && containing.edit.newText === candidate.edit.newText
      ) continue
      if (containing.edit.newText === '' && candidate.edit.newText === '') continue
      throw new EditorDocumentError('invalid-operation', 'Removal plans contain conflicting contained edits')
    }
    const overlap = kept.find(existing => candidate.start < existing.end && existing.start < candidate.end)
    if (overlap) {
      throw new EditorDocumentError('invalid-operation', 'Removal plans contain conflicting overlapping edits')
    }
    kept.push(candidate)
  }
  return kept.map(item => item.edit)
}

export function mergeRemovalPlans(
  sources: readonly SourceFile[],
  plans: readonly ApplicableEditPlan[],
): ApplicableEditPlan {
  const baseRevisions: Record<string, string> = {}
  const editsByUri = new Map<string, ApplicableTextEdit[]>()

  for (const plan of plans) {
    for (const [uri, revision] of Object.entries(plan.baseRevisions)) {
      const previous = baseRevisions[uri]
      if (previous && previous !== revision) {
        throw new EditorDocumentError('stale-document', `Removal plans disagree on source revision for ${uri}`)
      }
      baseRevisions[uri] = revision
    }
    for (const edit of plan.edits) {
      const edits = editsByUri.get(edit.uri) ?? []
      edits.push(edit)
      editsByUri.set(edit.uri, edits)
    }
  }

  const merged: ApplicableTextEdit[] = []
  for (const [uri, edits] of editsByUri) {
    const source = sources.find(candidate => candidate.uri === sourceKey(uri))
    if (!source) throw new EditorDocumentError('not-found', `Source document ${sourceKey(uri)} is unavailable`)
    merged.push(...mergeRemovalEdits(source, edits))
  }
  return { baseRevisions, edits: merged }
}

export const professionalSourceEditPort: ProfessionalSourceEditPort = {
  async createSubgraph(sources, plan) {
    try {
      let candidate = sources
      const documentUri = plannerDocumentUri(plan.documentUri)
      for (const element of plan.elements) {
        const stagedId = localElementId(element.id)
        let documents = await documentsFor(candidate)
        candidate = applyPlan(candidate, await documents.planAddElement({
          id: stagedId,
          kind: element.kind,
          title: element.title,
          documentUri,
        }))

        const patch = {
          ...(element.description ? { description: element.description } : {}),
          ...(element.technology ? { technology: element.technology } : {}),
          ...(element.tags.length > 0 ? { tags: element.tags } : {}),
        }
        if (Object.keys(patch).length > 0) {
          documents = await documentsFor(candidate)
          candidate = applyPlan(candidate, await documents.planPatchElement({
            target: stagedId,
            patch,
          }))
        }

        if (element.parentId) {
          documents = await documentsFor(candidate)
          candidate = applyPlan(candidate, await documents.planMoveElement({
            target: stagedId,
            parent: element.parentId,
          }))
        }
      }

      const occurrences = new Map<string, number>()
      for (const relation of plan.relations) {
        const documents = await documentsFor(candidate)
        candidate = applyPlan(candidate, await documents.planAddRelation({
          source: relation.sourceId,
          target: relation.targetId,
          documentUri,
        }))
        const key = `${relation.sourceId}\u0000${relation.targetId}`
        const occurrence = occurrences.get(key) ?? 0
        occurrences.set(key, occurrence + 1)
        if (relation.title) {
          candidate = patchLogicalRelationTitle(candidate, {
            sourceId: relation.sourceId,
            targetId: relation.targetId,
            occurrence,
            documentUri: plan.documentUri,
          }, relation.title)
        }
      }
      return candidate
    } catch (error) {
      return documentError(error)
    }
  },

  async removeSubgraph(sources, inspection) {
    try {
      const documents = await documentsFor(sources)
      const plans = inspection.reports.map(report => documents.planRemoveElement({
        target: report.target,
        dependencyRevision: report.revision,
        approvedDependencyIds: report.dependencies.map(dependency => dependency.id),
      }))
      return applyPlan(sources, mergeRemovalPlans(sources, plans))
    } catch (error) {
      return documentError(error)
    }
  },
}
