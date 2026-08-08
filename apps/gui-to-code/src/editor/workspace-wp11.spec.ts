import type { RelationId, ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import type { EditorCommand, EditorOperation } from './contracts'
import { languageServicesDocumentPort } from './language-services-adapter'
import { EditorWorkspace } from './workspace'

const duplicateSource = `specification {
  element actor
  element system
  deploymentNode environment
}

model {
  actor user
  system app
}

views {
  dynamic view flow {
    user -> app 'First'
    user -> app 'Second'
  }
}

deployment {
  environment prod
  environment edge
  prod -> edge 'Primary'
  prod -> edge 'Secondary'
}
`

function operation(semantic: EditorCommand, expectedRevision: number): EditorOperation {
  return { id: expectedRevision + 1, expectedRevision, semantic }
}

function snapshot(workspace: EditorWorkspace) {
  return {
    state: workspace.state,
    source: workspace.state.committedSources[0]!.content,
    layouts: structuredClone(workspace.state.manualLayouts),
    revision: workspace.state.revision,
    history: structuredClone(workspace.state.history),
  }
}

function dynamicIds(workspace: EditorWorkspace): string[] {
  const view = workspace.state.lastValidModel?.$data.views['flow' as ViewId]
  if (!view || view._type !== 'dynamic') throw new Error('dynamic view missing')
  return view.edges.map(edge => edge.id)
}

describe('EditorWorkspace WP-11 edge CRUD safety', () => {
  it('patches and removes exactly one dynamic duplicate while preserving the sibling', async () => {
    const workspace = await EditorWorkspace.create(
      [{ uri: 'model.c4', content: duplicateSource }],
      compile,
      languageServicesDocumentPort,
    )
    const ids = dynamicIds(workspace)
    expect(ids).toHaveLength(2)

    const patched = await workspace.dispatch(operation({
      type: 'dynamicStep.patch',
      input: { viewId: 'flow' as ViewId, id: ids[0]!, patch: { title: 'First updated' } },
    }, 0))
    expect(patched).toMatchObject({ status: 'applied', command: 'dynamicStep.patch', revision: 1 })
    expect(workspace.state.committedSources[0]!.content).toContain("user -> app 'First updated'")
    expect(workspace.state.committedSources[0]!.content).toContain("user -> app 'Second'")

    const currentIds = dynamicIds(workspace)
    const removed = await workspace.dispatch(operation({
      type: 'dynamicStep.remove',
      input: { viewId: 'flow' as ViewId, id: currentIds[0]! },
    }, 1))
    expect(removed).toMatchObject({ status: 'applied', command: 'dynamicStep.remove', revision: 2 })
    expect(workspace.state.committedSources[0]!.content).not.toContain('First updated')
    expect(workspace.state.committedSources[0]!.content).toContain("user -> app 'Second'")
    expect(workspace.state.committedSources[0]!.content.match(/user -> app/g)).toHaveLength(1)
  }, 15_000)

  it('patches and removes exactly one deployment duplicate even when derived relation IDs shift', async () => {
    const workspace = await EditorWorkspace.create(
      [{ uri: 'model.c4', content: duplicateSource }],
      compile,
      languageServicesDocumentPort,
    )
    const initialIds = Object.keys(workspace.state.lastValidModel?.$data.deployments.relations ?? {}) as RelationId[]
    expect(initialIds).toHaveLength(2)

    const patched = await workspace.dispatch(operation({
      type: 'deploymentRelation.patch',
      input: { id: initialIds[0]!, patch: { title: 'Primary updated' } },
    }, 0))
    expect(patched).toMatchObject({ status: 'applied', command: 'deploymentRelation.patch', revision: 1 })
    expect(workspace.state.committedSources[0]!.content).toContain("prod -> edge 'Primary updated'")
    expect(workspace.state.committedSources[0]!.content).toContain("prod -> edge 'Secondary'")

    const currentIds = Object.keys(workspace.state.lastValidModel?.$data.deployments.relations ?? {}) as RelationId[]
    const removed = await workspace.dispatch(operation({
      type: 'deploymentRelation.remove',
      input: { id: currentIds[0]! },
    }, 1))
    expect(removed).toMatchObject({ status: 'applied', command: 'deploymentRelation.remove', revision: 2 })
    expect(workspace.state.committedSources[0]!.content).not.toContain('Primary updated')
    expect(workspace.state.committedSources[0]!.content).toContain("prod -> edge 'Secondary'")
    expect(workspace.state.committedSources[0]!.content.match(/prod -> edge/g)).toHaveLength(1)
  }, 15_000)

  it('rejects invalid dynamic title without mutating source, layouts, revision or history', async () => {
    const workspace = await EditorWorkspace.create(
      [{ uri: 'model.c4', content: duplicateSource }],
      compile,
      languageServicesDocumentPort,
    )
    const before = snapshot(workspace)
    const result = await workspace.dispatch(operation({
      type: 'dynamicStep.patch',
      input: { viewId: 'flow' as ViewId, id: dynamicIds(workspace)[0]!, patch: { title: '   ' } },
    }, 0))
    expect(result).toMatchObject({ status: 'rejected', issues: [{ code: 'invalid-title' }] })
    expect(workspace.state).toBe(before.state)
    expect(workspace.state.committedSources[0]!.content).toBe(before.source)
    expect(workspace.state.manualLayouts).toEqual(before.layouts)
    expect(workspace.state.revision).toBe(before.revision)
    expect(workspace.state.history).toEqual(before.history)
  })

  it('rejects missing deployment relation without mutating workspace state identity', async () => {
    const workspace = await EditorWorkspace.create(
      [{ uri: 'model.c4', content: duplicateSource }],
      compile,
      languageServicesDocumentPort,
    )
    const before = workspace.state
    const result = await workspace.dispatch(operation({
      type: 'deploymentRelation.remove',
      input: { id: 'missing-relation' as RelationId },
    }, 0))
    expect(result).toMatchObject({ status: 'rejected', issues: [{ code: 'deployment-relation-not-found' }] })
    expect(workspace.state).toBe(before)
  })
})
