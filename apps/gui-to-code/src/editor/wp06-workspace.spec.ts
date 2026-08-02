import type { Fqn, ViewId } from '@likec4/core/types'
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
  })

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
