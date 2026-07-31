import type { Fqn, ProjectId, ViewId } from '@likec4/core/types'
import type { AstNode, CstNode, LangiumDocument } from 'langium'
import { URI } from 'vscode-uri'
import type { LikeC4, LikeC4Langium } from './LikeC4'
import {
  DocumentEditError,
  type DocumentTextEdit,
  type SourceEditPlan,
  sourceRevision,
} from './DocumentEditService'

export interface AddElementViewInput {
  readonly id: string
  readonly viewOf: Fqn
  readonly title?: string
  readonly documentUri?: string
  readonly project?: string
}

interface LikeC4Root extends AstNode {
  readonly models?: readonly AstNode[]
  readonly views?: readonly AstNode[]
}

interface ContainerInsertion {
  readonly position: { readonly line: number; readonly character: number }
  readonly indent: string
  readonly prefix: string
  readonly suffix: string
}

const ID_PATTERN = /^([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*$/

/** Browser-compatible source edit planner for static element views. */
export class ElementViewDocumentEditService {
  constructor(private readonly langium: LikeC4Langium) {
  }

  async planAddElementView(input: AddElementViewInput): Promise<SourceEditPlan> {
    this.assertIdentifier(input.id)
    const projectId = this.projectId(input.project)
    const parsed = await this.langium.likec4.likec4.ModelBuilder.parseModel(projectId)
    if (parsed?.$data.views[input.id as ViewId]) {
      throw new DocumentEditError('collision', `View "${input.id}" already exists`)
    }

    const scope = this.langium.likec4.likec4.ModelLocator.getParsedElement(input.viewOf, projectId)
    if (!scope) {
      throw new DocumentEditError('not-found', `Logical element "${input.viewOf}" was not found`)
    }

    const document = this.findTargetDocument(projectId, input.documentUri)
    const root = document.parseResult.value as LikeC4Root
    const viewsCst = root.views?.[0]?.$cstNode
    const title = input.title?.trim()
    const bodyLines = [
      ...(title ? [`title '${escapeSingleQuoted(title)}'`] : []),
      'include *',
    ]

    let edit: DocumentTextEdit
    if (viewsCst) {
      const insertion = insertionBeforeClosing(document, viewsCst)
      const childIndent = `${insertion.indent}  `
      const declaration = [
        `${insertion.indent}view ${input.id} of ${input.viewOf} {`,
        ...bodyLines.map(line => `${childIndent}${line}`),
        `${insertion.indent}}`,
      ].join('\n')
      edit = {
        uri: document.uri.toString(),
        range: { start: insertion.position, end: insertion.position },
        newText: `${insertion.prefix}${declaration}\n${insertion.suffix}`,
      }
    } else {
      const rootCst = root.$cstNode
      if (!rootCst) {
        throw new DocumentEditError('not-found', 'LikeC4 document source range was not found')
      }
      const source = document.textDocument.getText()
      const insertionOffset = rootCst.end
      const prefix = insertionOffset > 0 && source[insertionOffset - 1] !== '\n' ? '\n\n' : '\n'
      const declaration = [
        'views {',
        `  view ${input.id} of ${input.viewOf} {`,
        ...bodyLines.map(line => `    ${line}`),
        '  }',
        '}',
        '',
      ].join('\n')
      const position = document.textDocument.positionAt(insertionOffset)
      edit = {
        uri: document.uri.toString(),
        range: { start: position, end: position },
        newText: `${prefix}${declaration}`,
      }
    }

    return this.planFromEdit(edit)
  }

  private findTargetDocument(projectId: ProjectId, documentUri?: string): LangiumDocument {
    const documents = [...this.langium.shared.workspace.LangiumDocuments.userDocuments]
      .filter(document => document.likec4ProjectId === projectId)
    const requestedKey = documentUri ? sourceKey(URI.parse(documentUri).toString()) : null
    const selected = requestedKey
      ? documents.find(document => sourceKey(document.uri.toString()) === requestedKey)
      : documents.find(document => {
        const root = document.parseResult.value as LikeC4Root
        return !!root.views?.length
      }) ?? documents.find(document => {
        const root = document.parseResult.value as LikeC4Root
        return !!root.models?.length
      })
    if (!selected) {
      throw new DocumentEditError('not-found', 'No matching LikeC4 document found for the view')
    }
    return selected
  }

  private planFromEdit(edit: DocumentTextEdit): SourceEditPlan {
    const document = this.langium.shared.workspace.LangiumDocuments.getDocument(URI.parse(edit.uri))
    if (!document) {
      throw new DocumentEditError('not-found', `Document "${edit.uri}" was not found`)
    }
    return {
      baseRevisions: {
        [edit.uri]: sourceRevision(document.textDocument.getText()),
      },
      edits: [edit],
      affectedDocuments: [edit.uri],
    }
  }

  private projectId(project?: string): ProjectId {
    return this.langium.shared.workspace.ProjectsManager.ensureProjectId(project as ProjectId | undefined)
  }

  private assertIdentifier(id: string): void {
    if (!ID_PATTERN.test(id)) {
      throw new DocumentEditError('invalid-identifier', `Invalid LikeC4 view identifier "${id}"`)
    }
  }
}

/** Create the static-view edit planner for a browser or Node LikeC4 instance. */
export function createElementViewDocumentEditService(likec4: LikeC4): ElementViewDocumentEditService {
  const langium = (likec4 as unknown as { readonly langium: LikeC4Langium }).langium
  return new ElementViewDocumentEditService(langium)
}

function sourceKey(uri: string): string {
  const virtualPrefix = 'virtual:/workspace/'
  return uri.startsWith(virtualPrefix) ? uri.slice(virtualPrefix.length) : uri
}

function insertionBeforeClosing(document: LangiumDocument, cst: CstNode): ContainerInsertion {
  const source = document.textDocument.getText()
  const closingOffset = Math.max(cst.offset, cst.end - 1)
  const closingLineStart = source.lastIndexOf('\n', Math.max(0, closingOffset - 1)) + 1
  const closingIndent = source.slice(closingLineStart, closingOffset)
  const insertionOffset = /^[\t ]*$/.test(closingIndent) ? closingLineStart : closingOffset
  const actualClosingIndent = /^[\t ]*$/.test(closingIndent) ? closingIndent : ''
  return {
    position: document.textDocument.positionAt(insertionOffset),
    indent: `${actualClosingIndent}  `,
    prefix: insertionOffset > 0 && source[insertionOffset - 1] !== '\n' ? '\n' : '',
    suffix: actualClosingIndent,
  }
}

function escapeSingleQuoted(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'')
}
