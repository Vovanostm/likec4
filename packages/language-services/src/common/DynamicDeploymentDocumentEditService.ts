import type { Fqn, ProjectId, ViewId } from '@likec4/core/types'
import type { LangiumDocument } from 'langium'
import type { LikeC4, LikeC4Langium } from './LikeC4'
import {
  DocumentEditError,
  type SourceEditPlan,
  sourceRevision,
} from './DocumentEditService'
import {
  createDeploymentInstanceEdit,
  createDeploymentNodeEdit,
  createDeploymentRelationEdit,
  createDeploymentViewEdit,
  createDynamicStepEdit,
  createDynamicViewEdit,
} from './dynamicDeploymentSourceEdit'

export interface AddDynamicViewInput {
  readonly id: string
  readonly title?: string
  readonly documentUri?: string
  readonly project?: string
}

export interface AddDynamicStepInput {
  readonly viewId: ViewId
  readonly source: Fqn
  readonly target: Fqn
  readonly documentUri?: string
  readonly project?: string
}

export interface AddDeploymentViewInput {
  readonly id: string
  readonly title?: string
  readonly documentUri?: string
  readonly project?: string
}

export interface AddDeploymentNodeInput {
  readonly id: string
  readonly kind: string
  readonly title?: string
  readonly documentUri?: string
  readonly project?: string
}

export interface AddDeploymentInstanceInput {
  readonly id: string
  readonly target: Fqn
  readonly documentUri?: string
  readonly project?: string
}

export interface AddDeploymentRelationInput {
  readonly source: Fqn
  readonly target: Fqn
  readonly documentUri?: string
  readonly project?: string
}

const ID_PATTERN = /^([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*$/

type ParsedModel = {
  readonly $data: {
    readonly elements: Readonly<Record<string, unknown>>
    readonly views: Readonly<Record<string, { readonly _type?: string }>>
    readonly deployments?: Readonly<Record<string, unknown>>
    readonly deployment?: Readonly<Record<string, unknown>>
    readonly specification: {
      readonly deployments?: Readonly<Record<string, unknown>>
    }
  }
}

export class DynamicDeploymentDocumentEditService {
  constructor(private readonly langium: LikeC4Langium) {}

  async planAddDynamicView(input: AddDynamicViewInput): Promise<SourceEditPlan> {
    this.assertIdentifier(input.id)
    const { projectId, parsed } = await this.model(input.project)
    this.assertViewAvailable(parsed, input.id)
    const document = this.selectDocument(projectId, input.documentUri)
    return this.plan(document, createDynamicViewEdit(document, input.id, input.title))
  }

  async planAddDynamicStep(input: AddDynamicStepInput): Promise<SourceEditPlan> {
    if (input.source === input.target) {
      throw new DocumentEditError('invalid-operation', 'Dynamic step endpoints must be different')
    }
    const { projectId, parsed } = await this.model(input.project)
    const view = parsed.$data.views[input.viewId]
    if (!view || view._type !== 'dynamic') {
      throw new DocumentEditError('not-found', `Dynamic view "${input.viewId}" was not found`)
    }
    this.assertLogicalElement(parsed, input.source)
    this.assertLogicalElement(parsed, input.target)
    const document = this.selectDocument(projectId, input.documentUri, input.viewId)
    return this.plan(document, createDynamicStepEdit(document, input.viewId, input.source, input.target))
  }

  async planAddDeploymentView(input: AddDeploymentViewInput): Promise<SourceEditPlan> {
    this.assertIdentifier(input.id)
    const { projectId, parsed } = await this.model(input.project)
    this.assertViewAvailable(parsed, input.id)
    const document = this.selectDocument(projectId, input.documentUri)
    return this.plan(document, createDeploymentViewEdit(document, input.id, input.title))
  }

  async planAddDeploymentNode(input: AddDeploymentNodeInput): Promise<SourceEditPlan> {
    this.assertIdentifier(input.id)
    const { projectId, parsed } = await this.model(input.project)
    const kinds = parsed.$data.specification.deployments ?? {}
    if (!kinds[input.kind]) {
      throw new DocumentEditError('invalid-operation', `Unknown deployment kind "${input.kind}"`)
    }
    this.assertDeploymentAvailable(parsed, input.id)
    const document = this.selectDocument(projectId, input.documentUri)
    return this.plan(document, createDeploymentNodeEdit(document, input.id, input.kind, input.title))
  }

  async planAddDeploymentInstance(input: AddDeploymentInstanceInput): Promise<SourceEditPlan> {
    this.assertIdentifier(input.id)
    const { projectId, parsed } = await this.model(input.project)
    this.assertLogicalElement(parsed, input.target)
    this.assertDeploymentAvailable(parsed, input.id)
    const document = this.selectDocument(projectId, input.documentUri)
    return this.plan(document, createDeploymentInstanceEdit(document, input.id, input.target))
  }

  async planAddDeploymentRelation(input: AddDeploymentRelationInput): Promise<SourceEditPlan> {
    if (input.source === input.target) {
      throw new DocumentEditError('invalid-operation', 'Deployment relation endpoints must be different')
    }
    const { projectId, parsed } = await this.model(input.project)
    this.assertDeploymentExists(parsed, input.source)
    this.assertDeploymentExists(parsed, input.target)
    const document = this.selectDocument(projectId, input.documentUri)
    return this.plan(document, createDeploymentRelationEdit(document, input.source, input.target))
  }

  private async model(project?: string): Promise<{ projectId: ProjectId; parsed: ParsedModel }> {
    const projectId = this.langium.shared.workspace.ProjectsManager.ensureProjectId(project as ProjectId | undefined)
    const parsed = await this.langium.likec4.likec4.ModelBuilder.parseModel(projectId) as ParsedModel | undefined
    if (!parsed) {
      throw new DocumentEditError('not-found', 'Compiled LikeC4 model was not found')
    }
    return { projectId, parsed }
  }

  private assertIdentifier(id: string): void {
    if (!ID_PATTERN.test(id)) {
      throw new DocumentEditError('invalid-identifier', `Invalid LikeC4 identifier "${id}"`)
    }
  }

  private assertViewAvailable(parsed: ParsedModel, id: string): void {
    if (parsed.$data.views[id]) {
      throw new DocumentEditError('collision', `View "${id}" already exists`)
    }
  }

  private assertLogicalElement(parsed: ParsedModel, id: Fqn): void {
    if (!parsed.$data.elements[id]) {
      throw new DocumentEditError('not-found', `Logical element "${id}" was not found`)
    }
  }

  private deployments(parsed: ParsedModel): Readonly<Record<string, unknown>> {
    return parsed.$data.deployments ?? parsed.$data.deployment ?? {}
  }

  private assertDeploymentAvailable(parsed: ParsedModel, id: string): void {
    if (this.deployments(parsed)[id]) {
      throw new DocumentEditError('collision', `Deployment element "${id}" already exists`)
    }
  }

  private assertDeploymentExists(parsed: ParsedModel, id: Fqn): void {
    if (!this.deployments(parsed)[id]) {
      throw new DocumentEditError('not-found', `Deployment element "${id}" was not found`)
    }
  }

  private selectDocument(projectId: ProjectId, requestedUri?: string, viewId?: ViewId): LangiumDocument {
    if (viewId) {
      const located = this.langium.likec4.likec4.ModelLocator.getParsedView(viewId, projectId)
      if (located && !requestedUri) return located.document
    }
    const documents = [...this.langium.shared.workspace.LangiumDocuments.userDocuments]
      .filter(document => document.likec4ProjectId === projectId)
    if (!requestedUri) {
      if (documents.length === 1) return documents[0]!
      if (documents.length === 0) throw new DocumentEditError('not-found', 'No LikeC4 document was found')
      throw new DocumentEditError('ambiguous-reference', 'Target document must be selected explicitly')
    }
    const requestedPath = normalizedDocumentPath(requestedUri)
    const exact = documents.filter(document => normalizedDocumentPath(document.uri.path) === requestedPath)
    if (exact.length === 1) return exact[0]!
    if (exact.length > 1) throw new DocumentEditError('ambiguous-reference', `Document URI "${requestedUri}" is ambiguous`)
    const suffix = documents.filter(document => normalizedDocumentPath(document.uri.path).endsWith(`/${requestedPath}`))
    if (suffix.length === 1) return suffix[0]!
    if (suffix.length > 1) throw new DocumentEditError('ambiguous-reference', `Document URI "${requestedUri}" is ambiguous`)
    throw new DocumentEditError('not-found', `Document URI "${requestedUri}" was not found`)
  }

  private plan(document: LangiumDocument, edit: ReturnType<typeof createDynamicViewEdit>): SourceEditPlan {
    return {
      baseRevisions: { [edit.uri]: sourceRevision(document.textDocument.getText()) },
      edits: [edit],
      affectedDocuments: [edit.uri],
    }
  }
}

function normalizedDocumentPath(uri: string): string {
  return uri
    .replace(/^virtual:\/\/workspace\//, '')
    .replace(/^virtual:\/workspace\//, '')
    .replace(/^\/+/, '')
    .replace(/^workspace\//, '')
}

export function createDynamicDeploymentDocumentEditService(likec4: LikeC4): DynamicDeploymentDocumentEditService {
  const langium = (likec4 as unknown as { readonly langium: LikeC4Langium }).langium
  return new DynamicDeploymentDocumentEditService(langium)
}
