import type { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import type { EditorCommand } from './contracts'
import { layerCommandDisabledReason } from './layer-command-guard'
import { EditorWorkspace } from './workspace'

describe('locked relationship side effects', () => {
  it('protects a locked external endpoint during subtree removal, rename and move', async () => {
    const owner = await EditorWorkspace.create([{
      uri: 'model.c4',
      content: `specification { element service }
model {
  a = service { child = service }
  b = service
  c = service
  a.child -> b
}
views { view index { include * } }`,
    }], compile)
    const model = owner.state.lastValidModel
    expect(model).not.toBeNull()
    const locked = new Set(['b' as Fqn])
    const commands: readonly EditorCommand[] = [
      { type: 'element.remove', input: { id: 'a' as Fqn, dependencyRevision: '', approvedDependencyIds: [] } },
      { type: 'element.rename', input: { id: 'a' as Fqn, newId: 'renamed' } },
      { type: 'element.move', input: { id: 'a' as Fqn, parentId: 'c' as Fqn } },
      { type: 'element.remove', input: { id: 'a.child' as Fqn, dependencyRevision: '', approvedDependencyIds: [] } },
    ]
    for (const command of commands) {
      expect(layerCommandDisabledReason(command, model, locked)).toContain('заблокирован')
      expect(layerCommandDisabledReason(command, model, new Set())).toBeNull()
    }
    expect(layerCommandDisabledReason(
      {
        type: 'element.remove',
        input: { id: 'c' as Fqn, dependencyRevision: '', approvedDependencyIds: [] },
      },
      model,
      locked,
    ))
      .toBeNull()
  })
})
