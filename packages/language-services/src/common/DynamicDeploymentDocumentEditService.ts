import type { Fqn, ProjectId, ViewId } from '@likec4/core/types'
import type { AstNode, LangiumDocument } from 'langium'
import { AstUtils } from 'langium'
import type { LikeC4, LikeC4Langium } from './LikeC4'
import { DocumentEditError, type SourceEditPlan, sourceRevision } from './DocumentEditService'
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
  readonly parentId: Fqn
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

type ParsedDeploymentElement = {
  readonly id?: Fqn
  readonly _type?: string
  readonly kind?: string
  readonly element?: unknown
}

type ParsedModel = {
  readonly $data: {
    readonly elements: Readonly<Record<string, unknown>>
    readonly views: Readonly<Record<string, { readonly _type?: string }>>
    readonly deployments: {
      readonly elements: Readonly<Record<string, ParsedDeploymentElement>>
      readonly relations: Readonly<Record<string, unknown>>
    }
    readonly specification: {
      readonly deployments?: Readonly<Record<string, unknown>>
    }
  }
}

type ParsedDocument = LangiumDocument & {
  readonly c4Views?: readonly { readonly id: ViewId }[]
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
      throw new DocumentEditError('invalid-operation', 'Исходный и целевой элементы динамического шага должны различаться')
    }
    const { projectId, parsed } = await this.model(input.project)
    const view = parsed.$data.views[input.viewId]
    if (!view || view._type !== 'dynamic') {
      throw new DocumentEditError('not-found', `Динамический вид «${input.viewId}» не найден`)
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
      throw new DocumentEditError('invalid-operation', `Тип deployment-узла «${input.kind}» не поддерживается спецификацией`)
    }
    this.assertDeploymentAvailable(parsed, input.id)
    const document = this.selectDocument(projectId, input.documentUri)
    return this.plan(document, createDeploymentNodeEdit(document, input.id, input.kind, input.title))
  }

  async planAddDeploymentInstance(input: AddDeploymentInstanceInput): Promise<SourceEditPlan> {
    this.assertIdentifier(input.id)
    const { projectId, parsed } = await this.model(input.project)
    this.assertLogicalElement(parsed, input.target)
    this.assertDeploymentParent(parsed, input.parentId)
    const fullId = `${input.parentId}.${input.id}` as Fqn
    this.assertDeploymentAvailable(parsed, fullId)
    const document = this.selectDeploymentOwner(projectId, input.parentId, input.documentUri)
    return this.plan(document, createDeploymentInstanceEdit(document, input.parentId, input.id, input.target))
  }

  async planAddDeploymentRelation(input: AddDeploymentRelationInput): Promise<SourceEditPlan> {
    if (input.source === input.target) {
      throw new DocumentEditError('invalid-operation', 'Исходная и целевая deployment-сущности должны различаться')
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
      throw new DocumentEditError('not-found', 'Скомпилированная модель LikeC4 не найдена')
    }
    return { projectId, parsed }
  }

  private assertIdentifier(id: string): void {
    if (!ID_PATTERN.test(id)) {
      throw new DocumentEditError('invalid-identifier', `Недопустимый идентификатор LikeC4 «${id}»`)
    }
  }

  private assertViewAvailable(parsed: ParsedModel, id: string): void {
    if (parsed.$data.views[id]) {
      throw new DocumentEditError('collision', `Вид «${id}» уже существует`)
    }
  }

  private assertLogicalElement(parsed: ParsedModel, id: Fqn): void {
    if (!parsed.$data.elements[id]) {
      throw new DocumentEditError('not-found', `Логический элемент «${id}» не найден`)
    }
  }

  private assertDeploymentAvailable(parsed: ParsedModel, id: string): void {
    if (parsed.$data.deployments.elements[id]) {
      throw new DocumentEditError('collision', `Deployment-сущность «${id}» уже существует`)
    }
  }

  private assertDeploymentParent(parsed: ParsedModel, id: Fqn): void {
    const parent = parsed.$data.deployments.elements[id]
    if (!parent) {
      throw new DocumentEditError('not-found', `Родительский deployment-узел «${id}» не найден`)
    }
    if (parent._type === 'deployment-instance' || parent._type === 'instance' || parent.element !== undefined) {
      throw new DocumentEditError('invalid-parent', `Deployment-сущность «${id}» не может содержать именованный экземпляр`)
    }
  }

  private assertDeploymentExists(parsed: ParsedModel, id: Fqn): void {
    if (!parsed.$data.deployments.elements[id]) {
      throw new DocumentEditError('not-found', `Deployment-сущность «${id}» не найдена`)
    }
  }

  private selectDeploymentOwner(projectId: ProjectId, parentId: Fqn, requestedUri?: string): LangiumDocument {
    if (requestedUri) {
      const document = this.selectDocument(projectId, requestedUri)
      if (!documentContainsDeployment(document, parentId)) {
        throw new DocumentEditError('not-found', `Deployment-узел «${parentId}» не найден в выбранном документе`)
      }
      return document
    }
    const documents = this.projectDocuments(projectId)
    const owners = documents.filter(document => documentContainsDeployment(document, parentId))
    if (owners.length === 1) return owners[0]!
    if (owners.length > 1) {
      throw new DocumentEditError('ambiguous-reference', `Deployment-узел «${parentId}» имеет несколько владельцев исходного кода`)
    }
    throw new DocumentEditError('not-found', `Владелец исходного кода deployment-узла «${parentId}» не найден`)
  }

  private selectDocument(projectId: ProjectId, requestedUri?: string, viewId?: ViewId): LangiumDocument {
    const documents = this.projectDocuments(projectId)
    if (!requestedUri && viewId) {
      const owners = documents.filter(document => (document as ParsedDocument).c4Views?.some(view => view.id === viewId))
      if (owners.length === 1) return owners[0]!
      if (owners.length > 1) throw new DocumentEditError('ambiguous-reference', `Вид «${viewId}» имеет несколько владельцев исходного кода`)
    }
    if (!requestedUri) {
      if (documents.length === 1) return documents[0]!
      if (documents.length === 0) throw new DocumentEditError('not-found', 'Документ LikeC4 не найден')
      throw new DocumentEditError('ambiguous-reference', 'Целевой документ должен быть выбран явно')
    }
    const requestedPath = normalizedDocumentPath(requestedUri)
    const exact = documents.filter(document => normalizedDocumentPath(document.uri.path) === requestedPath)
    if (exact.length === 1) return exact[0]!
    if (exact.length > 1) throw new DocumentEditError('ambiguous-reference', `URI документа «${requestedUri}» неоднозначен`)
    const suffix = documents.filter(document => normalizedDocumentPath(document.uri.path).endsWith(`/${requestedPath}`))
    if (suffix.length === 1) return suffix[0]!
    if (suffix.length > 1) throw new DocumentEditError('ambiguous-reference', `URI документа «${requestedUri}» неоднозначен`)
    throw new DocumentEditError('not-found', `Документ с URI «${requestedUri}» не найден`)
  }

  private projectDocuments(projectId: ProjectId): LangiumDocument[] {
    return [...this.langium.shared.workspace.LangiumDocuments.userDocuments]
      .filter(document => document.likec4ProjectId === projectId)
  }

  private plan(document: LangiumDocument, edit: ReturnType<typeof createDynamicViewEdit>): SourceEditPlan {
    return {
      baseRevisions: { [edit.uri]: sourceRevision(document.textDocument.getText()) },
      edits: [edit],
      affectedDocuments: [edit.uri],
    }
  }
}

function documentContainsDeployment(document: LangiumDocument, id: Fqn): boolean {
  return [...AstUtils.streamAllContents(document.parseResult.value)].some(node => {
    const candidate = node as AstNode & { readonly name?: string; readonly id?: string }
    return (candidate.name ?? candidate.id) === id && node.$type.includes('Deployment') && !node.$type.includes('Instance')
  })
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
