import type { Fqn, ViewId } from '@likec4/core/types'
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

function apply(current: string, plan: SourceEditPlan): string {
  const uri = plan.affectedDocuments[0]!
  return applyDocumentTextEdits(
    current,
    plan.edits.filter((edit): edit is DocumentTextEdit => edit.uri === uri),
    plan.baseRevisions[uri]!,
  )
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

  it('rejects invalid IDs, missing endpoints, collisions and stale plans', async () => {
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
  })
})
