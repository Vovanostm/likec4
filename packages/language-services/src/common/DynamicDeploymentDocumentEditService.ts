import type { Fqn, ProjectId, RelationId, ViewId } from '@likec4/core/types'
import type { AstNode, LangiumDocument } from 'langium'
import { AstUtils } from 'langium'
import type { LikeC4, LikeC4Langium } from './LikeC4'
import {
  DocumentEditError,
  type DocumentTextEdit,
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
  patchDeploymentRelationTitleEdit,
  patchDynamicStepTitleEdit,
  removeDeploymentRelationEdit,
  removeDynamicStepEdit,
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

export interface DynamicStepPatch {
  readonly title?: string
}

export interface PatchDynamicStepInput {
  readonly viewId: ViewId
  readonly astPath: string
  readonly patch: DynamicStepPatch
  readonly project?: string
}

export interface RemoveDynamicStepInput {
  readonly viewId: ViewId
  readonly astPath: string
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

export interface DeploymentRelationPatch {
  readonly title?: string
}

export interface PatchDeploymentRelationInput {
  readonly id: RelationId
  readonly patch: DeploymentRelationPatch
  readonly project?: string
}

export interface RemoveDeploymentRelationInput {
  readonly id: RelationId
  readonly project?: string
}

const ID_PATTERN = /^([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*$/

type ParsedDeploymentElement = {
  readonly id?: string
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

type ParsedViewDescriptor = {
  readonly _type?: string
  readonly id: ViewId
  readonly astPath: string
}

type ParsedDeploymentRelationDescriptor = {
  readonly id: RelationId
  readonly astPath: string
}

type ParsedDocument = LangiumDocument & {
  readonly c4Views?: readonly ParsedViewDescriptor[]
  readonly c4DeploymentRelations?: readonly ParsedDeploymentRelationDescriptor[]
}

type DynamicViewNode = AstNode & {
  readonly body?: AstNode
}

type LocatedNode = {
  readonly document: LangiumDocument
  readonly node: AstNode
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

  async planPatchDynamicStep(input: PatchDynamicStepInput): Promise<SourceEditPlan> {
    const title = this.patchTitle(input.patch)
    const { projectId } = await this.model(input.project)
    const located = this.locateDynamicStep(projectId, input.viewId, input.astPath)
    return this.plan(located.document, patchDynamicStepTitleEdit(located.document, located.node, title))
  }

  async planRemoveDynamicStep(input: RemoveDynamicStepInput): Promise<SourceEditPlan> {
    const { projectId } = await this.model(input.project)
    const located = this.locateDynamicStep(projectId, input.viewId, input.astPath)
    return this.plan(located.document, removeDynamicStepEdit(located.document, located.node))
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
    const fullId = `${input.parentId}.${input.id}`
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

  async planPatchDeploymentRelation(input: PatchDeploymentRelationInput): Promise<SourceEditPlan> {
    const title = this.patchTitle(input.patch)
    const { projectId } = await this.model(input.project)
    const located = this.locateDeploymentRelation(projectId, input.id)
    return this.plan(located.document, patchDeploymentRelationTitleEdit(located.document, located.node, title))
  }

  async planRemoveDeploymentRelation(input: RemoveDeploymentRelationInput): Promise<SourceEditPlan> {
    const { projectId } = await this.model(input.project)
    const located = this.locateDeploymentRelation(projectId, input.id)
    return this.plan(located.document, removeDeploymentRelationEdit(located.document, located.node))
  }

  private async model(project?: string): Promise<{ projectId: ProjectId; parsed: ParsedModel }> {
    const projectId = this.langium.shared.workspace.ProjectsManager.ensureProjectId(project as ProjectId | undefined)
    const parsed = await this.langium.likec4.likec4.ModelBuilder.parseModel(projectId) as unknown as ParsedModel | undefined
    if (!parsed) {
      throw new DocumentEditError('not-found', 'Скомпилированная модель LikeC4 не найдена')
    }
    return { projectId, parsed }
  }

  private patchTitle(patch: DynamicStepPatch | DeploymentRelationPatch): string {
    if (patch.title === undefined) {
      throw new DocumentEditError('invalid-operation', 'Изменение связи не содержит поддерживаемых полей')
    }
    const title = patch.title.trim()
    if (!title) {
      throw new DocumentEditError('invalid-title', 'Название связи не может быть пустым')
    }
    return title
  }

  private locateDynamicStep(projectId: ProjectId, viewId: ViewId, astPath: string): LocatedNode {
    const owners = this.parsedDocuments(projectId).flatMap(document =>
      (document.c4Views ?? [])
        .filter(view => view.id === viewId && view._type === 'dynamic')
        .map(view => ({ document, view })))
    if (owners.length === 0) {
      throw new DocumentEditError('not-found', `Динамический вид «${viewId}» не найден`)
    }
    if (owners.length > 1) {
      throw new DocumentEditError('ambiguous-reference', `Динамический вид «${viewId}» имеет несколько владельцев исходного кода`)
    }
    const owner = owners[0]!
    const viewNode = this.langium.likec4.workspace.AstNodeLocator.getAstNode(
      owner.document.parseResult.value,
      owner.view.astPath,
    ) as DynamicViewNode | undefined
    const body = viewNode?.body
    if (!body) {
      throw new DocumentEditError('not-found', `Тело динамического вида «${viewId}» не найдено`)
    }
    const node = this.langium.likec4.workspace.AstNodeLocator.getAstNode(body, astPath) as AstNode | undefined
    if (!node?.$cstNode || (node.$type !== 'Step' && node.$type !== 'StepSeries')) {
      throw new DocumentEditError('not-found', 'Выбранный направленный шаг больше не существует')
    }
    return { document: owner.document, node }
  }

  private locateDeploymentRelation(projectId: ProjectId, id: RelationId): LocatedNode {
    const matches = this.parsedDocuments(projectId).flatMap(document =>
      (document.c4DeploymentRelations ?? [])
        .filter(relation => relation.id === id)
        .map(relation => ({ document, relation })))
    if (matches.length === 0) {
      throw new DocumentEditError('not-found', `Связь развёртывания «${id}» не найдена`)
    }
    if (matches.length > 1) {
      throw new DocumentEditError('ambiguous-reference', `Связь развёртывания «${id}» имеет несколько владельцев исходного кода`)
    }
    const match = matches[0]!
    const node = this.langium.likec4.workspace.AstNodeLocator.getAstNode(
      match.document.parseResult.value,
      match.relation.astPath,
    ) as AstNode | undefined
    if (!node?.$cstNode || node.$type !== 'DeploymentRelation') {
      throw new DocumentEditError('not-found', `Исходная декларация связи развёртывания «${id}» не найдена`)
    }
    return { document: match.document, node }
  }

  private parsedDocuments(projectId: ProjectId): ParsedDocument[] {
    return [...this.langium.likec4.likec4.ModelParser.documents(projectId)] as ParsedDocument[]
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

  private plan(document: LangiumDocument, edit: DocumentTextEdit): SourceEditPlan {
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
