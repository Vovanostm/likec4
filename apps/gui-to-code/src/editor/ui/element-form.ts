import type { Fqn } from '@likec4/core/types'
import type {
  EditorOperation,
  ElementPatch,
  RemovalDependency,
  Revision,
} from '../contracts'

export interface ElementFormValues {
  readonly title: string
  readonly description: string
  readonly technology: string
  readonly tags: readonly string[]
}

export function patchFromForm(values: ElementFormValues): ElementPatch {
  return {
    title: values.title.trim(),
    description: values.description.length === 0 ? null : values.description,
    technology: values.technology.length === 0 ? null : values.technology,
    tags: [...new Set(values.tags)].sort((left, right) => left.localeCompare(right)),
  }
}

export function patchOperation(id: Fqn, revision: Revision, values: ElementFormValues): EditorOperation {
  return {
    id: Date.now(),
    expectedRevision: revision,
    semantic: { type: 'element.patch', input: { id, patch: patchFromForm(values) } },
  }
}

export function renameOperation(id: Fqn, revision: Revision, newId: string): EditorOperation {
  return {
    id: Date.now(),
    expectedRevision: revision,
    semantic: { type: 'element.rename', input: { id, newId: newId.trim() } },
  }
}

export function moveOperation(id: Fqn, revision: Revision, parentId: Fqn | null): EditorOperation {
  return {
    id: Date.now(),
    expectedRevision: revision,
    semantic: { type: 'element.move', input: { id, parentId } },
  }
}

export const dependencyKindLabels: Readonly<Record<RemovalDependency['kind'], string>> = {
  'child-element': 'Дочерний элемент',
  'incoming-relation': 'Входящая связь',
  'outgoing-relation': 'Исходящая связь',
  'scoped-view': 'Представление элемента',
  'view-reference': 'Ссылка в представлении',
  'semantic-reference': 'Семантическая ссылка',
}
