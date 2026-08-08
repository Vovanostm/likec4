import type { Fqn, RelationId, ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import type { EditorCommand, EditorOperation } from './contracts'
import { languageServicesDocumentPort } from './language-services-adapter'
import { EditorWorkspace } from './workspace'

const source = `specification {
  element actor
  element system
  deploymentNode environment
}

model {
  user = actor 'User'
  app = system 'Application'
}

views {
  view index {
    include *
  }
}
`

function operation(semantic: EditorCommand, expectedRevision: number): EditorOperation {
  return { id: expectedRevision + 1, expectedRevision, semantic }
}

describe('EditorWorkspace WP-06 integration', () => {
  it('commits dynamic and deployment workflows as atomic history entries', async () => {
    const workspace = await EditorWorkspace.create(
      [{ uri: 'model.c4', content: source }],
      compile,
      languageServicesDocumentPort,
    )

    expect(await workspace.dispatch(operation({
      type: 'dynamicView.create',
      input: { id: 'flow', title: 'Request flow', documentUri: 'model.c4' },
    }, 0))).toMatchObject({ status: 'applied', command: 'dynamicView.create', revision: 1 })

    expect(await workspace.dispatch(operation({
      type: 'dynamicStep.create',
      input: {
        viewId: 'flow' as ViewId,
        sourceId: 'user' as Fqn,
        targetId: 'app' as Fqn,
        documentUri: 'model.c4',
      },
    }, 1))).toMatchObject({ status: 'applied', command: 'dynamicStep.create', revision: 2 })

    expect(await workspace.dispatch(operation({
      type: 'deploymentElement.create',
      input: {
        family: 'node',
        kind: 'environment',
        id: 'prod',
        title: 'Production',
        documentUri: 'model.c4',
      },
    }, 2))).toMatchObject({ status: 'applied', command: 'deploymentElement.create', revision: 3 })

    expect(await workspace.dispatch(operation({
      type: 'deploymentElement.create',
      input: {
        family: 'instance',
        parentId: 'prod' as Fqn,
        id: 'application',
        target: 'app' as Fqn,
        documentUri: 'model.c4',
      },
    }, 3))).toMatchObject({
      status: 'applied',
      command: 'deploymentElement.create',
      revision: 4,
      createdDeploymentId: 'prod.application',
    })

    expect(await workspace.dispatch(operation({
      type: 'deploymentView.create',
      input: { id: 'production', title: 'Production deployment', documentUri: 'model.c4' },
    }, 4))).toMatchObject({ status: 'applied', command: 'deploymentView.create', revision: 5 })

    expect(workspace.state.history.past).toHaveLength(5)
    const committed = workspace.state.committedSources[0]!.content
    expect(committed).toContain('dynamic view flow')
    expect(committed).toContain('user -> app')
    expect(committed).toContain("environment prod 'Production'")
    expect(committed).toContain('application = instanceOf app')
    expect(committed).toContain('deployment view production')

    expect(await workspace.undo(5)).toMatchObject({ status: 'applied', command: 'history.undo', revision: 6 })
    expect(workspace.state.committedSources[0]!.content).not.toContain('deployment view production')
    expect(await workspace.redo(6)).toMatchObject({ status: 'applied', command: 'history.redo', revision: 7 })
    expect(workspace.state.committedSources[0]!.content).toBe(committed)
  }, 15_000)

  it('patches and removes one dynamic step with exact undo/redo and unchanged layouts', async () => {
    const workspace = await EditorWorkspace.create(
      [{ uri: 'model.c4', content: source }],
      compile,
      languageServicesDocumentPort,
    )
    await workspace.dispatch(operation({
      type: 'dynamicView.create',
      input: { id: 'flow', documentUri: 'model.c4' },
    }, 0))
    const created = await workspace.dispatch(operation({
      type: 'dynamicStep.create',
      input: {
        viewId: 'flow' as ViewId,
        sourceId: 'user' as Fqn,
        targetId: 'app' as Fqn,
        documentUri: 'model.c4',
      },
    }, 1))
    if (created.status !== 'applied' || created.command !== 'dynamicStep.create') {
      throw new Error('dynamic step creation failed')
    }
    const original = workspace.state.committedSources[0]!.content
    const layouts = structuredClone(workspace.state.manualLayouts)

    const patched = await workspace.dispatch(operation({
      type: 'dynamicStep.patch',
      input: {
        viewId: 'flow' as ViewId,
        id: created.createdStepId,
        patch: { title: 'Request to application' },
      },
    }, 2))
    expect(patched).toMatchObject({ status: 'applied', command: 'dynamicStep.patch', revision: 3 })
    if (patched.status !== 'applied' || patched.command !== 'dynamicStep.patch') {
      throw new Error('dynamic step patch failed')
    }
    const patchedSource = workspace.state.committedSources[0]!.content
    expect(patchedSource).toContain("user -> app 'Request to application'")
    expect(workspace.state.history.past).toHaveLength(3)
    expect(workspace.state.manualLayouts).toEqual(layouts)

    expect(await workspace.undo(3)).toMatchObject({ status: 'applied', command: 'history.undo', revision: 4 })
    expect(workspace.state.committedSources[0]!.content).toBe(original)
    expect(await workspace.redo(4)).toMatchObject({ status: 'applied', command: 'history.redo', revision: 5 })
    expect(workspace.state.committedSources[0]!.content).toBe(patchedSource)

    const removed = await workspace.dispatch(operation({
      type: 'dynamicStep.remove',
      input: { viewId: 'flow' as ViewId, id: patched.updatedStepId },
    }, 5))
    expect(removed).toMatchObject({ status: 'applied', command: 'dynamicStep.remove', revision: 6 })
    expect(workspace.state.committedSources[0]!.content).not.toContain('user -> app')
    expect(workspace.state.manualLayouts).toEqual(layouts)

    expect(await workspace.undo(6)).toMatchObject({ status: 'applied', command: 'history.undo', revision: 7 })
    expect(workspace.state.committedSources[0]!.content).toBe(patchedSource)
    expect(await workspace.redo(7)).toMatchObject({ status: 'applied', command: 'history.redo', revision: 8 })
    expect(workspace.state.committedSources[0]!.content).not.toContain('user -> app')

    const beforeConflict = workspace.state
    expect(await workspace.dispatch(operation({
      type: 'dynamicStep.patch',
      input: { viewId: 'flow' as ViewId, id: patched.updatedStepId, patch: { title: 'Stale' } },
    }, 7))).toMatchObject({ status: 'conflict', revision: 8 })
    expect(workspace.state).toBe(beforeConflict)
  }, 20_000)

  it('patches and removes one deployment relation with exact undo/redo and unchanged layouts', async () => {
    const workspace = await EditorWorkspace.create(
      [{ uri: 'model.c4', content: source }],
      compile,
      languageServicesDocumentPort,
    )
    await workspace.dispatch(operation({
      type: 'deploymentElement.create',
      input: { family: 'node', kind: 'environment', id: 'prod', documentUri: 'model.c4' },
    }, 0))
    await workspace.dispatch(operation({
      type: 'deploymentElement.create',
      input: { family: 'node', kind: 'environment', id: 'edge', documentUri: 'model.c4' },
    }, 1))
    const created = await workspace.dispatch(operation({
      type: 'deploymentRelation.create',
      input: { sourceId: 'prod' as Fqn, targetId: 'edge' as Fqn, documentUri: 'model.c4' },
    }, 2))
    if (created.status !== 'applied' || created.command !== 'deploymentRelation.create') {
      throw new Error('deployment relation creation failed')
    }
    const original = workspace.state.committedSources[0]!.content
    const layouts = structuredClone(workspace.state.manualLayouts)

    const patched = await workspace.dispatch(operation({
      type: 'deploymentRelation.patch',
      input: { id: created.createdRelationId as RelationId, patch: { title: 'Traffic' } },
    }, 3))
    expect(patched).toMatchObject({ status: 'applied', command: 'deploymentRelation.patch', revision: 4 })
    if (patched.status !== 'applied' || patched.command !== 'deploymentRelation.patch') {
      throw new Error('deployment relation patch failed')
    }
    const patchedSource = workspace.state.committedSources[0]!.content
    expect(patchedSource).toContain("prod -> edge 'Traffic'")
    expect(workspace.state.history.past).toHaveLength(4)
    expect(workspace.state.manualLayouts).toEqual(layouts)

    expect(await workspace.undo(4)).toMatchObject({ status: 'applied', command: 'history.undo', revision: 5 })
    expect(workspace.state.committedSources[0]!.content).toBe(original)
    expect(await workspace.redo(5)).toMatchObject({ status: 'applied', command: 'history.redo', revision: 6 })
    expect(workspace.state.committedSources[0]!.content).toBe(patchedSource)

    const removed = await workspace.dispatch(operation({
      type: 'deploymentRelation.remove',
      input: { id: patched.updatedRelationId },
    }, 6))
    expect(removed).toMatchObject({ status: 'applied', command: 'deploymentRelation.remove', revision: 7 })
    expect(workspace.state.committedSources[0]!.content).not.toContain('prod -> edge')
    expect(workspace.state.manualLayouts).toEqual(layouts)

    expect(await workspace.undo(7)).toMatchObject({ status: 'applied', command: 'history.undo', revision: 8 })
    expect(workspace.state.committedSources[0]!.content).toBe(patchedSource)
    expect(await workspace.redo(8)).toMatchObject({ status: 'applied', command: 'history.redo', revision: 9 })
    expect(workspace.state.committedSources[0]!.content).not.toContain('prod -> edge')
  }, 20_000)

  it('rejects a same-endpoint dynamic step without changing state identity', async () => {
    const workspace = await EditorWorkspace.create(
      [{ uri: 'model.c4', content: source }],
      compile,
      languageServicesDocumentPort,
    )
    await workspace.dispatch(operation({
      type: 'dynamicView.create',
      input: { id: 'flow', documentUri: 'model.c4' },
    }, 0))
    const before = workspace.state

    const result = await workspace.dispatch(operation({
      type: 'dynamicStep.create',
      input: {
        viewId: 'flow' as ViewId,
        sourceId: 'app' as Fqn,
        targetId: 'app' as Fqn,
        documentUri: 'model.c4',
      },
    }, 1))

    expect(result).toMatchObject({ status: 'rejected', issues: [{ code: 'same-endpoint' }] })
    expect(workspace.state).toBe(before)
  })
})
