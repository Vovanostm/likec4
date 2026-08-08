import type { RelationId, ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { fromSources } from '../node'
import { applyDocumentTextEdits, type DocumentTextEdit, type SourceEditPlan } from './DocumentEditService'
import { createDynamicDeploymentDocumentEditService } from './DynamicDeploymentDocumentEditService'

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

function apply(current: string, plan: SourceEditPlan): string {
  const uri = plan.affectedDocuments[0]!
  return applyDocumentTextEdits(
    current,
    plan.edits.filter((edit): edit is DocumentTextEdit => edit.uri === uri),
    plan.baseRevisions[uri]!,
  )
}

async function identities(source: string) {
  const likec4 = await fromSources({ 'model.c4': source })
  const parsed = await likec4.parsedModel()
  const view = parsed.$data.views['flow']
  if (!view || view._type !== 'dynamic') throw new Error('dynamic view missing')
  const paths = view.steps.flatMap(step => 'astPath' in step ? [step.astPath] : [])
  const relationIds = Object.keys(parsed.$data.deployments.relations) as RelationId[]
  return { likec4, paths, relationIds }
}

describe('WP-11 exact duplicate identity', () => {
  it('patches the first duplicate dynamic step without changing the second', async () => {
    const { likec4, paths } = await identities(duplicateSource)
    const plan = await createDynamicDeploymentDocumentEditService(likec4).planPatchDynamicStep({
      viewId: 'flow' as ViewId,
      astPath: paths[0]!,
      patch: { title: 'First updated' },
    })
    const candidate = apply(duplicateSource, plan)
    expect(candidate).toContain("user -> app 'First updated'")
    expect(candidate).toContain("user -> app 'Second'")
    expect(candidate.match(/user -> app/g)).toHaveLength(2)
  })

  it('removes the first duplicate dynamic step and keeps the second exact declaration', async () => {
    const { likec4, paths } = await identities(duplicateSource)
    const plan = await createDynamicDeploymentDocumentEditService(likec4).planRemoveDynamicStep({
      viewId: 'flow' as ViewId,
      astPath: paths[0]!,
    })
    const candidate = apply(duplicateSource, plan)
    expect(candidate).not.toContain("user -> app 'First'")
    expect(candidate).toContain("user -> app 'Second'")
    expect(candidate.match(/user -> app/g)).toHaveLength(1)
  })

  it('patches the first duplicate deployment relation without changing the second', async () => {
    const { likec4, relationIds } = await identities(duplicateSource)
    const plan = await createDynamicDeploymentDocumentEditService(likec4).planPatchDeploymentRelation({
      id: relationIds[0]!,
      patch: { title: 'Primary updated' },
    })
    const candidate = apply(duplicateSource, plan)
    expect(candidate).toContain("prod -> edge 'Primary updated'")
    expect(candidate).toContain("prod -> edge 'Secondary'")
    expect(candidate.match(/prod -> edge/g)).toHaveLength(2)
  })
})
