import type { Fqn } from '@likec4/core/types'
import type { AstNode, DocumentSegment, LangiumDocument } from 'langium'
import { AstUtils, GrammarUtils } from 'langium'
import { DocumentEditError, type DocumentTextEdit } from './DocumentEditService'

interface LikeC4Root extends AstNode {
  readonly views?: readonly AstNode[]
  readonly deployments?: readonly AstNode[]
}

export function createDynamicViewEdit(
  document: LangiumDocument,
  id: string,
  title?: string,
): DocumentTextEdit {
  return insertView(document, `dynamic view ${id}`, title, [])
}

export function createDeploymentViewEdit(
  document: LangiumDocument,
  id: string,
  title?: string,
): DocumentTextEdit {
  return insertView(document, `deployment view ${id}`, title, ['include *'])
}

export function createDynamicStepEdit(
  document: LangiumDocument,
  viewId: string,
  source: Fqn,
  target: Fqn,
): DocumentTextEdit {
  const view = findNamedNode(document, 'DynamicView', viewId)
  return insertStatement(document, view, `${source} -> ${target}`)
}

export function patchDynamicStepTitleEdit(
  document: LangiumDocument,
  node: AstNode,
  title: string,
): DocumentTextEdit {
  return patchInlineTitle(document, node, title)
}

export function removeDynamicStepEdit(document: LangiumDocument, node: AstNode): DocumentTextEdit {
  if (node.$type === 'StepSeries' || node.$container?.$type === 'StepSeries') {
    throw new DocumentEditError(
      'invalid-operation',
      'Нельзя безопасно удалить один сегмент цепочки направленных шагов без изменения соседних шагов',
    )
  }
  if (node.$type !== 'Step') {
    throw new DocumentEditError('invalid-operation', 'Выбранный направленный шаг нельзя удалить как отдельную декларацию')
  }
  return removeDeclaration(document, node)
}

export function createDeploymentNodeEdit(
  document: LangiumDocument,
  id: string,
  kind: string,
  title?: string,
): DocumentTextEdit {
  const header = `${kind} ${id}${title?.trim() ? ` '${escapeTitle(title.trim())}'` : ''}`
  return insertDeploymentStatement(document, `${header} {\n  }`)
}

export function createDeploymentInstanceEdit(
  document: LangiumDocument,
  parentId: Fqn,
  id: string,
  target: Fqn,
): DocumentTextEdit {
  const parent = findDeploymentNode(document, parentId)
  return insertStatement(document, parent, `${id} = instanceOf ${target}`)
}

export function createDeploymentRelationEdit(
  document: LangiumDocument,
  source: Fqn,
  target: Fqn,
): DocumentTextEdit {
  return insertDeploymentStatement(document, `${source} -> ${target}`)
}

export function patchDeploymentRelationTitleEdit(
  document: LangiumDocument,
  node: AstNode,
  title: string,
): DocumentTextEdit {
  return patchInlineTitle(document, node, title)
}

export function removeDeploymentRelationEdit(document: LangiumDocument, node: AstNode): DocumentTextEdit {
  if (node.$type !== 'DeploymentRelation') {
    throw new DocumentEditError('invalid-operation', 'Выбранная связь развёртывания не является декларацией связи')
  }
  return removeDeclaration(document, node)
}

function patchInlineTitle(document: LangiumDocument, node: AstNode, title: string): DocumentTextEdit {
  const segment = node.$cstNode
  if (!segment) {
    throw new DocumentEditError('not-found', 'Диапазон исходного кода выбранной связи не найден')
  }
  const escaped = `'${escapeTitle(title)}'`
  const currentTitle = GrammarUtils.findNodeForProperty(segment, 'title')
  if (currentTitle) {
    return {
      uri: document.uri.toString(),
      range: currentTitle.range,
      newText: escaped,
    }
  }
  const target = GrammarUtils.findNodeForProperty(segment, 'target')
  if (!target) {
    throw new DocumentEditError('not-found', 'Диапазон целевой сущности выбранной связи не найден')
  }
  const position = document.textDocument.positionAt(target.end)
  return {
    uri: document.uri.toString(),
    range: { start: position, end: position },
    newText: ` ${escaped}`,
  }
}

function removeDeclaration(document: LangiumDocument, node: AstNode): DocumentTextEdit {
  const segment = node.$cstNode
  if (!segment) {
    throw new DocumentEditError('not-found', 'Диапазон исходного кода выбранной связи не найден')
  }
  const source = document.textDocument.getText()
  let start = segment.offset
  let end = segment.end
  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  if (/^\s*$/.test(source.slice(lineStart, start))) {
    start = lineStart
  }
  const nextLine = source.indexOf('\n', end)
  if (nextLine >= 0 && /^\s*$/.test(source.slice(end, nextLine))) {
    end = nextLine + 1
  } else if (nextLine < 0 && /^\s*$/.test(source.slice(end))) {
    end = source.length
  }
  return {
    uri: document.uri.toString(),
    range: {
      start: document.textDocument.positionAt(start),
      end: document.textDocument.positionAt(end),
    },
    newText: '',
  }
}

function insertView(
  document: LangiumDocument,
  header: string,
  title: string | undefined,
  statements: readonly string[],
): DocumentTextEdit {
  const root = document.parseResult.value as LikeC4Root
  const viewsSegment = root.views?.[0]?.$cstNode
  const declaration = blockDeclaration(header, title, statements, '  ')
  if (viewsSegment) {
    return insertBeforeClosing(document, viewsSegment, declaration)
  }
  return appendRootBlock(document, root, `views {\n${declaration}\n}`)
}

function insertDeploymentStatement(document: LangiumDocument, statement: string): DocumentTextEdit {
  const root = document.parseResult.value as LikeC4Root
  const deployment = findFirstNode(document, 'ModelDeployments')
  if (deployment) {
    return insertStatement(document, deployment, statement)
  }
  return appendRootBlock(document, root, `deployment {\n  ${statement}\n}`)
}

function insertStatement(document: LangiumDocument, node: AstNode, statement: string): DocumentTextEdit {
  const segment = node.$cstNode
  if (!segment) {
    throw new DocumentEditError('not-found', 'Диапазон исходного кода LikeC4 не найден')
  }
  const indent = `${lineIndent(document.textDocument.getText(), segment.offset)}  `
  const indented = statement.split('\n').map(line => `${indent}${line}`).join('\n')
  return insertBeforeClosing(document, segment, indented)
}

function insertBeforeClosing(
  document: LangiumDocument,
  segment: DocumentSegment,
  declaration: string,
): DocumentTextEdit {
  const offset = segment.end - 1
  const position = document.textDocument.positionAt(offset)
  return {
    uri: document.uri.toString(),
    range: { start: position, end: position },
    newText: `\n${declaration}\n${lineIndent(document.textDocument.getText(), segment.offset)}`,
  }
}

function appendRootBlock(document: LangiumDocument, root: AstNode, block: string): DocumentTextEdit {
  const segment = root.$cstNode
  if (!segment) {
    throw new DocumentEditError('not-found', 'Диапазон исходного кода документа LikeC4 не найден')
  }
  const source = document.textDocument.getText()
  const position = document.textDocument.positionAt(segment.end)
  const prefix = segment.end > 0 && source[segment.end - 1] !== '\n' ? '\n\n' : '\n'
  return {
    uri: document.uri.toString(),
    range: { start: position, end: position },
    newText: `${prefix}${block}\n`,
  }
}

function blockDeclaration(
  header: string,
  title: string | undefined,
  statements: readonly string[],
  indent: string,
): string {
  const childIndent = `${indent}  `
  return [
    `${indent}${header} {`,
    ...(title?.trim() ? [`${childIndent}title '${escapeTitle(title.trim())}'`] : []),
    ...statements.map(statement => `${childIndent}${statement}`),
    `${indent}}`,
  ].join('\n')
}

function findNamedNode(document: LangiumDocument, type: string, name: string): AstNode {
  const match = [...AstUtils.streamAllContents(document.parseResult.value)]
    .find(node => node.$type === type && (node as AstNode & { readonly name?: string }).name === name)
  if (!match) {
    throw new DocumentEditError('not-found', `${type} «${name}» не найден`)
  }
  return match
}

function findDeploymentNode(document: LangiumDocument, id: Fqn): AstNode {
  const matches = [...AstUtils.streamAllContents(document.parseResult.value)]
    .filter(node => {
      const candidate = node as AstNode & { readonly name?: string; readonly id?: string }
      const name = candidate.name ?? candidate.id
      return name === id && node.$type.includes('Deployment') && !node.$type.includes('Instance')
    })
  if (matches.length === 1) return matches[0]!
  if (matches.length > 1) {
    throw new DocumentEditError('ambiguous-reference', `Родительский deployment-узел «${id}» имеет несколько владельцев исходного кода`)
  }
  throw new DocumentEditError('not-found', `Родительский deployment-узел «${id}» не найден`)
}

function findFirstNode(document: LangiumDocument, type: string): AstNode | undefined {
  return [...AstUtils.streamAllContents(document.parseResult.value)].find(node => node.$type === type)
}

function lineIndent(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  return source.slice(lineStart, offset).match(/^\s*/)?.[0] ?? ''
}

function escapeTitle(value: string): string {
  return value.split('\\').join('\\\\').split('\'').join('\\\'')
}
