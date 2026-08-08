import type { Fqn, RelationId, ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { fromSources } from '../node'
import { applyDocumentTextEdits, type DocumentTextEdit, type SourceEditPlan } from './DocumentEditService'
import { createDynamicDeploymentDocumentEditService } from './DynamicDeploymentDocumentEditService'

const source = `specification {
  element actor
  element system
  deploymentNode environment
}

model {
  actor user
  system app
}

views {
  // preserve this comment
  view index {
    include *
  }
}
`

const edgeSource = `specification {
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
    // first dynamic comment
    user -> app 'First'
    user -> app 'Second'
    // after dynamic comment
  }
}

deployment {
  environment prod
  environment edge
  // first deployment comment
  prod -> edge 'Primary'
  prod -> edge 'Secondary'
  // after deployment comment
}
`

function apply(current: string, plan: SourceEditPlan): string {
  const uri = plan.affectedDocuments[0]!
  return applyDocumentTextEdits(
    current,
    plan.edits.filter((edit): edit is DocumentTextEdit => edit.uri === uri),
    plan.baseRevisions[uri]!,
  )
}

async function dynamicStepPaths(current: string): Promise<string[]> {
  const likec4 = await fromSources({ 'model.c4': current })
  const parsed = await likec4.parsedModel()
  const view = parsed.$data.views['flow']
  if (!view || view._type !== 'dynamic') throw new Error('dynamic view missing')
  return view.steps.flatMap(step => 'astPath' in step ? [step.astPath] : [])
}

async function deploymentRelationIds(current: string): Promise<RelationId[]> {
  const likec4 = await fromSources({ 'model.c4': current })
  const parsed = await likec4.parsedModel()
  return Object.keys(parsed.$data.deployments.relations) as RelationId[]
}

describe('DynamicDeploymentDocumentEditService', () => {
  it('creates a dynamic view and directed step without rewriting neighboring source', async () => {
    const initial = await fromSources({ 'model.c4': source })
    const views = createDynamicDeploymentDocumentEditService(initial)
    const viewPlan = await views.planAddDynamicView({ id: 'flow', title: 'Flow', documentUri: 'model.c4' })
    const withView = apply(source, viewPlan)
    expect(withView).toContain("dynamic view flow {\n    title 'Flow'\n  }")
    expect(withView).toContain('// preserve this comment')

    const next = await fromSources({ 'model.c4': withView })
    const stepPlan = await createDynamicDeploymentDocumentEditService(next).planAddDynamicStep({
      viewId: 'flow' as ViewId,
      source: 'user' as Fqn,
      target: 'app' as Fqn,
      documentUri: 'model.c4',
    })
    const candidate = apply(withView, stepPlan)
    expect(candidate.match(/user -> app/g)).toHaveLength(1)
    const parsed = await (await fromSources({ 'model.c4': candidate })).parsedModel()
    expect(parsed.$data.views['flow']?._type).toBe('dynamic')
  })

  it('creates deployment node, named instance, relation and view', async () => {
    const initial = await fromSources({ 'model.c4': source })
    const nodePlan = await createDynamicDeploymentDocumentEditService(initial).planAddDeploymentNode({
      id: 'prod',
      kind: 'environment',
      documentUri: 'model.c4',
    })
    const withNode = apply(source, nodePlan)

    const instanceModel = await fromSources({ 'model.c4': withNode })
    const instancePlan = await createDynamicDeploymentDocumentEditService(instanceModel).planAddDeploymentInstance({
      id: 'appInstance',
      parentId: 'prod' as Fqn,
      target: 'app' as Fqn,
      documentUri: 'model.c4',
    })
    const withInstance = apply(withNode, instancePlan)

    const secondNodeModel = await fromSources({ 'model.c4': withInstance })
    const secondNodePlan = await createDynamicDeploymentDocumentEditService(secondNodeModel).planAddDeploymentNode({
      id: 'edge',
      kind: 'environment',
      documentUri: 'model.c4',
    })
    const withSecondNode = apply(withInstance, secondNodePlan)

    const relationModel = await fromSources({ 'model.c4': withSecondNode })
    const relationPlan = await createDynamicDeploymentDocumentEditService(relationModel).planAddDeploymentRelation({
      source: 'prod.appInstance' as Fqn,
      target: 'edge' as Fqn,
      documentUri: 'model.c4',
    })
    const withRelation = apply(withSecondNode, relationPlan)

    const viewModel = await fromSources({ 'model.c4': withRelation })
    const viewPlan = await createDynamicDeploymentDocumentEditService(viewModel).planAddDeploymentView({
      id: 'deployment',
      documentUri: 'model.c4',
    })
    const candidate = apply(withRelation, viewPlan)

    expect(candidate).toContain('environment prod {')
    expect(candidate).toContain('appInstance = instanceOf app')
    expect(candidate).toContain('prod.appInstance -> edge')
    expect(candidate).toContain('deployment view deployment')
    const parsed = await (await fromSources({ 'model.c4': candidate })).parsedModel()
    expect(parsed.$data.views['deployment']?._type).toBe('deployment')
    expect(parsed.$data.deployments.elements['prod.appInstance']).toBeDefined()
  })

  it('patches exact duplicate dynamic steps by astPath and preserves comments', async () => {
    const paths = await dynamicStepPaths(edgeSource)
    expect(paths).toHaveLength(2)

    const second = await fromSources({ 'model.c4': edgeSource })
    const plan = await createDynamicDeploymentDocumentEditService(second).planPatchDynamicStep({
      viewId: 'flow' as ViewId,
      astPath: paths[1]!,
      patch: { title: `Second \\ 'updated'` },
    })
    const candidate = apply(edgeSource, plan)

    expect(candidate).toContain("user -> app 'First'")
    expect(candidate).toContain("user -> app 'Second \\\\ \\'updated\\''")
    expect(candidate).toContain('// first dynamic comment')
    expect(candidate).toContain('// after dynamic comment')
  })

  it('adds a missing dynamic step title and removes only the selected duplicate', async () => {
    const withoutTitle = edgeSource.replace("user -> app 'First'", 'user -> app')
    const paths = await dynamicStepPaths(withoutTitle)
    const initial = await fromSources({ 'model.c4': withoutTitle })
    const patchPlan = await createDynamicDeploymentDocumentEditService(initial).planPatchDynamicStep({
      viewId: 'flow' as ViewId,
      astPath: paths[0]!,
      patch: { title: 'Inserted' },
    })
    const patched = apply(withoutTitle, patchPlan)
    expect(patched).toContain("user -> app 'Inserted'")

    const patchedPaths = await dynamicStepPaths(patched)
    const removalModel = await fromSources({ 'model.c4': patched })
    const removePlan = await createDynamicDeploymentDocumentEditService(removalModel).planRemoveDynamicStep({
      viewId: 'flow' as ViewId,
      astPath: patchedPaths[1]!,
    })
    const removed = apply(patched, removePlan)
    expect(removed.match(/user -> app/g)).toHaveLength(1)
    expect(removed).toContain("user -> app 'Inserted'")
    expect(removed).toContain('// after dynamic comment')
  })

  it('rejects unsafe removal of one dynamic chain segment', async () => {
    const chain = edgeSource.replace("user -> app 'First'\n    user -> app 'Second'", 'user -> app -> user')
    const likec4 = await fromSources({ 'model.c4': chain })
    const parsed = await likec4.parsedModel()
    const view = parsed.$data.views['flow']
    if (!view || view._type !== 'dynamic') throw new Error('dynamic view missing')
    const series = view.steps[0]
    if (!series || !('steps' in series)) throw new Error('dynamic series missing')
    const chainedPath = series.steps[1]!.astPath
    await expect(createDynamicDeploymentDocumentEditService(likec4).planRemoveDynamicStep({
      viewId: 'flow' as ViewId,
      astPath: chainedPath,
    })).rejects.toMatchObject({ code: 'invalid-operation' })
  })

  it('patches and removes exact duplicate deployment relations by RelationId', async () => {
    const ids = await deploymentRelationIds(edgeSource)
    expect(ids).toHaveLength(2)

    const initial = await fromSources({ 'model.c4': edgeSource })
    const patchPlan = await createDynamicDeploymentDocumentEditService(initial).planPatchDeploymentRelation({
      id: ids[1]!,
      patch: { title: 'Secondary updated' },
    })
    const patched = apply(edgeSource, patchPlan)
    expect(patched).toContain("prod -> edge 'Primary'")
    expect(patched).toContain("prod -> edge 'Secondary updated'")
    expect(patched).toContain('// first deployment comment')

    const patchedIds = await deploymentRelationIds(patched)
    const removalModel = await fromSources({ 'model.c4': patched })
    const removePlan = await createDynamicDeploymentDocumentEditService(removalModel).planRemoveDeploymentRelation({
      id: patchedIds[0]!,
    })
    const removed = apply(patched, removePlan)
    expect(removed.match(/prod -> edge/g)).toHaveLength(1)
    expect(removed).toContain("prod -> edge 'Secondary updated'")
    expect(removed).toContain('// after deployment comment')
  })

  it('locates dynamic and deployment owners exactly across multiple files', async () => {
    const base = `specification { element actor element system deploymentNode environment }\nmodel { actor user system app }\n`
    const dynamic = `views { dynamic view flow { user -> app 'Flow' } }\n`
    const deployment = `deployment { environment prod environment edge prod -> edge 'Deploy' }\n`
    const likec4 = await fromSources({ 'model.c4': base, 'views.c4': dynamic, 'deployment.c4': deployment })
    const parsed = await likec4.parsedModel()
    const view = parsed.$data.views['flow']
    if (!view || view._type !== 'dynamic') throw new Error('dynamic view missing')
    const step = view.steps[0]
    if (!step || !('astPath' in step)) throw new Error('dynamic step missing')
    const relationId = Object.keys(parsed.$data.deployments.relations)[0] as RelationId
    const service = createDynamicDeploymentDocumentEditService(likec4)

    const dynamicPlan = await service.planPatchDynamicStep({
      viewId: 'flow' as ViewId,
      astPath: step.astPath,
      patch: { title: 'Updated flow' },
    })
    expect(dynamicPlan.affectedDocuments[0]).toContain('views.c4')

    const deploymentPlan = await service.planPatchDeploymentRelation({
      id: relationId,
      patch: { title: 'Updated deploy' },
    })
    expect(deploymentPlan.affectedDocuments[0]).toContain('deployment.c4')
  })

  it('rejects invalid IDs, missing endpoints, missing edge identities and stale plans', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const edits = createDynamicDeploymentDocumentEditService(likec4)
    await expect(edits.planAddDynamicView({ id: 'bad id' })).rejects.toMatchObject({ code: 'invalid-identifier' })
    await expect(edits.planAddDynamicStep({
      viewId: 'missing' as ViewId,
      source: 'user' as Fqn,
      target: 'app' as Fqn,
    })).rejects.toMatchObject({ code: 'not-found' })
    const plan = await edits.planAddDynamicView({ id: 'flow', documentUri: 'model.c4' })
    expect(() => apply(`${source}\n// changed`, plan)).toThrowError(expect.objectContaining({ code: 'stale-document' }))
    const candidate = apply(source, plan)
    const retried = await fromSources({ 'model.c4': candidate })
    await expect(createDynamicDeploymentDocumentEditService(retried).planAddDynamicView({ id: 'flow' }))
      .rejects.toMatchObject({ code: 'collision' })

    const edgeLikec4 = await fromSources({ 'model.c4': edgeSource })
    const edgeService = createDynamicDeploymentDocumentEditService(edgeLikec4)
    await expect(edgeService.planPatchDynamicStep({
      viewId: 'flow' as ViewId,
      astPath: '/steps@999',
      patch: { title: 'Missing' },
    })).rejects.toMatchObject({ code: 'not-found' })
    await expect(edgeService.planPatchDeploymentRelation({
      id: 'missing' as RelationId,
      patch: { title: 'Missing' },
    })).rejects.toMatchObject({ code: 'not-found' })
  })
})
