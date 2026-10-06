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
  readonly icon?: string | null
  readonly tags: readonly string[]
}

export function patchFromForm(values: ElementFormValues, base?: ElementFormValues): ElementPatch {
  const patch = {
    title: values.title.trim(),
    description: values.description.length === 0 ? null : values.description,
    technology: values.technology.length === 0 ? null : values.technology,
    ...(values.icon !== undefined ? { icon: values.icon || null } : {}),
    tags: [...new Set(values.tags)].sort((left, right) => left.localeCompare(right)),
  }
  if (!base) return patch
  const baseTags = [...new Set(base.tags)].sort((left, right) => left.localeCompare(right))
  const tagsChanged = patch.tags.length !== baseTags.length || patch.tags.some((tag, index) => tag !== baseTags[index])
  const technologyChanged = values.technology !== base.technology
  // Explicit technology selection commits its logo in the same sparse command. Older callers
  // that only submit text still remove an existing logo when changing that text.
  const icon = values.icon !== undefined ? values.icon || null : technologyChanged && base.icon ? null : undefined
  return {
    ...(patch.title !== base.title.trim() ? { title: patch.title } : {}),
    ...(values.description !== base.description ? { description: patch.description } : {}),
    ...(technologyChanged ? { technology: patch.technology } : {}),
    ...(icon !== undefined && (technologyChanged || icon !== (base.icon || null)) ? { icon } : {}),
    ...(tagsChanged ? { tags: patch.tags } : {}),
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
