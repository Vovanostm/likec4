import {
  applyDocumentTextEdits,
  createDocumentEditService,
  createElementViewDocumentEditService,
  createDynamicDeploymentDocumentEditService,
  DocumentEditError,
  fromSources,
} from '@likec4/language-services/browser'
import type { DocumentEditErrorCode, RemovalDependencyReport as LanguageRemovalReport } from '@likec4/language-services/browser'
import type {
  EditorDocumentPort,
  RemovalDependencyReport,
  SourceFile,
} from './contracts'
import { EditorDocumentError } from './contracts'

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

function removalReport(report: LanguageRemovalReport): RemovalDependencyReport {
  return report as RemovalDependencyReport
}

function documentError(error: unknown): never {
  if (error instanceof DocumentEditError) {
    throw new EditorDocumentError(
      error.code as DocumentEditErrorCode,
      error.message,
      error.dependencies ? removalReport(error.dependencies) : undefined,
    )
  }
  throw new EditorDocumentError('unknown', error instanceof Error ? error.message : String(error))
}

async function serviceFor(sources: readonly SourceFile[]) {
  const likec4 = await fromSources(Object.fromEntries(sources.map(source => [source.uri, source.content])))
  return {
    documents: createDocumentEditService(likec4),
    views: createElementViewDocumentEditService(likec4),
    semantics: createDynamicDeploymentDocumentEditService(likec4),
  }
}

export const languageServicesDocumentPort: EditorDocumentPort = {
  async createElement(sources, input) {
    try {
      const { documents } = await serviceFor(sources)
      return applyPlan(sources, await documents.planAddElement({
        id: input.id,
        kind: input.kind,
        ...(input.title ? { title: input.title } : {}),
        ...(input.documentUri ? { documentUri: input.documentUri } : {}),
      }))
    } catch (error) {
      return documentError(error)
    }
  },

  async createRelation(sources, input) {
    try {
      const { documents } = await serviceFor(sources)
      return applyPlan(sources, await documents.planAddRelation({
        source: input.sourceId,
        target: input.targetId,
        ...(input.documentUri ? { documentUri: input.documentUri } : {}),
      }))
    } catch (error) {
      return documentError(error)
    }
  },

  async createView(sources, input) {
    try {
      const { views } = await serviceFor(sources)
      return applyPlan(sources, await views.planAddElementView({
        id: input.id,
        viewOf: input.viewOf,
        ...(input.title ? { title: input.title } : {}),
        ...(input.documentUri ? { documentUri: input.documentUri } : {}),
      }))
    } catch (error) {
      return documentError(error)
    }
  },

  async createDynamicView(sources, input) {
    try {
      const { semantics } = await serviceFor(sources)
      return applyPlan(sources, await semantics.planAddDynamicView(input))
    } catch (error) {
      return documentError(error)
    }
  },

  async createDynamicStep(sources, input) {
    try {
      const { semantics } = await serviceFor(sources)
      return applyPlan(sources, await semantics.planAddDynamicStep({
        viewId: input.viewId,
        source: input.sourceId,
        target: input.targetId,
        ...(input.documentUri ? { documentUri: input.documentUri } : {}),
      }))
    } catch (error) {
      return documentError(error)
    }
  },

  async createDeploymentView(sources, input) {
    try {
      const { semantics } = await serviceFor(sources)
      return applyPlan(sources, await semantics.planAddDeploymentView(input))
    } catch (error) {
      return documentError(error)
    }
  },

  async createDeploymentNode(sources, input) {
    try {
      const { semantics } = await serviceFor(sources)
      return applyPlan(sources, await semantics.planAddDeploymentNode(input))
    } catch (error) {
      return documentError(error)
    }
  },

  async createDeploymentInstance(sources, input) {
    try {
      const { semantics } = await serviceFor(sources)
      return applyPlan(sources, await semantics.planAddDeploymentInstance(input))
    } catch (error) {
      return documentError(error)
    }
  },

  async createDeploymentRelation(sources, input) {
    try {
      const { semantics } = await serviceFor(sources)
      return applyPlan(sources, await semantics.planAddDeploymentRelation({
        source: input.sourceId,
        target: input.targetId,
        ...(input.documentUri ? { documentUri: input.documentUri } : {}),
      }))
    } catch (error) {
      return documentError(error)
    }
  },

  async patchElement(sources, input) {
    try {
      const { documents } = await serviceFor(sources)
      return applyPlan(sources, await documents.planPatchElement({ target: input.id, patch: input.patch }))
    } catch (error) {
      return documentError(error)
    }
  },

  async moveElement(sources, input) {
    try {
      const { documents } = await serviceFor(sources)
      return applyPlan(sources, await documents.planMoveElement({ target: input.id, parent: input.parentId }))
    } catch (error) {
      return documentError(error)
    }
  },

  async renameElement(sources, input) {
    try {
      const { documents } = await serviceFor(sources)
      return applyPlan(sources, await documents.planRenameElement({ target: input.id, newId: input.newId }))
    } catch (error) {
      return documentError(error)
    }
  },

  async inspectRemoveElement(sources, id) {
    try {
      const { documents } = await serviceFor(sources)
      return removalReport(documents.inspectRemoveElement({ target: id }))
    } catch (error) {
      return documentError(error)
    }
  },

  async removeElement(sources, input) {
    try {
      const { documents } = await serviceFor(sources)
      return applyPlan(sources, documents.planRemoveElement({
        target: input.id,
        dependencyRevision: input.dependencyRevision,
        approvedDependencyIds: input.approvedDependencyIds,
      }))
    } catch (error) {
      return documentError(error)
    }
  },
}
