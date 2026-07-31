import type { Fqn, ProjectId, ViewId } from '@likec4/core/types'
import type { LangiumDocument } from 'langium'
import type { LikeC4, LikeC4Langium } from './LikeC4'
import {
  DocumentEditError,
  type SourceEditPlan,
  sourceRevision,
} from './DocumentEditService'
import { createElementViewEdit } from './elementViewSourceEdit'

export interface AddElementViewInput {
  readonly id: string
  readonly viewOf: Fqn
  readonly title?: string
  readonly documentUri?: string
  readonly project?: string
}

const ID_PATTERN = /^([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*$/

export class ElementViewDocumentEditService {
  constructor(private readonly langium: LikeC4Langium) {}

  async planAddElementView(input: AddElementViewInput): Promise<SourceEditPlan> {
    if (!ID_PATTERN.test(input.id)) {
      throw new DocumentEditError('invalid-identifier', `Invalid LikeC4 view identifier "${input.id}"`)
    }
    const projectId = this.langium.shared.workspace.ProjectsManager.ensureProjectId(
      input.project as ProjectId | undefined,
    )
    const parsed = await this.langium.likec4.likec4.ModelBuilder.parseModel(projectId)
    if (parsed?.$data.views[input.id as ViewId]) {
      throw new DocumentEditError('collision', `View "${input.id}" already exists`)
    }
    const scope = this.langium.likec4.likec4.ModelLocator.getParsedElement(input.viewOf, projectId)
    if (!scope) {
      throw new DocumentEditError('not-found', `Logical element "${input.viewOf}" was not found`)
    }

    const document = input.documentUri
      ? this.findParsedDocument(input.documentUri)
      : scope.document
    if (!document?.parseResult) {
      throw new DocumentEditError('not-found', 'No parsed LikeC4 document found for the view')
    }

    const edit = createElementViewEdit(document, input.id, input.viewOf, input.title)
    return {
      baseRevisions: { [edit.uri]: sourceRevision(document.textDocument.getText()) },
      edits: [edit],
      affectedDocuments: [edit.uri],
    }
  }

  private findParsedDocument(requestedUri: string): LangiumDocument | undefined {
    const requestedPath = requestedUri
      .replace(/^virtual:\/\/workspace\//, '')
      .replace(/^virtual:\/workspace\//, '')
      .replace(/^\/+/, '')
    return [...this.langium.shared.workspace.LangiumDocuments.userDocuments]
      .find(document => {
        const path = document.uri.path.replace(/^\/+/, '')
        return path === requestedPath || path.endsWith(`/${requestedPath}`)
      })
  }
}

export function createElementViewDocumentEditService(likec4: LikeC4): ElementViewDocumentEditService {
  const langium = (likec4 as unknown as { readonly langium: LikeC4Langium }).langium
  return new ElementViewDocumentEditService(langium)
}
