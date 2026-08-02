# WP-06 Dynamic and Deployment discovery

Status: implementation prerequisite

Base SHA: `b7592227c7a63a527aab430b6e7d03bdf92d693a`

## Supported constructs

| Construct | Grammar/model owner | Stable identity | Edit owner |
| --- | --- | --- | --- |
| Dynamic view | `@likec4/language-server` | `ViewId` | new `DynamicDocumentEditService` |
| Dynamic step | `Step` / parsed dynamic view | `{ viewId, astPath }` | `DynamicDocumentEditService` |
| Deployment view | `@likec4/language-server` | `ViewId` | new `DeploymentDocumentEditService` |
| Deployment node | deployment model | deployment FQN | `DeploymentDocumentEditService` |
| Named `instanceOf` | deployment model + logical target | deployment FQN | `DeploymentDocumentEditService` |
| Deployment relation | deployment relationship | compiled relation identity | `DeploymentDocumentEditService` |

The existing grammar, model pipeline and `@likec4/diagram` renderer support the required minimum. No grammar or renderer extension is required.

## Architecture decision

Existing-source edits remain owned by `@likec4/language-services`. The application must not parse or mutate DSL text directly.

Add family-specific public services with identical browser and Node exports:

```ts
DynamicDocumentEditService
  .planAddDynamicView(...)
  .planAddDynamicStep(...)

DeploymentDocumentEditService
  .planAddDeploymentView(...)
  .planAddDeploymentNode(...)
  .planAddDeployedInstance(...)
  .planAddDeploymentRelation(...)
```

Each planner must use linked AST/CST ranges and exact source URI selection, preserve bytes outside the edit range, bind plans to source revisions, reject ambiguous targets and duplicates, and reuse the existing source-edit plan/application mechanism.

## Supported minimum

Dynamic:

```likec4
views {
  dynamic view checkout {
    customer -> api
  }
}
```

Deployment:

```likec4
specification {
  element service
  deploymentNode node
}
model {
  service api
  service database
}
deployment {
  node production {
    apiInstance = instanceOf api
    databaseInstance = instanceOf database
    apiInstance -> databaseInstance
  }
}
views {
  deployment view productionDeployment {
    include production.**
  }
}
```

Named deployment instances are the WP-06 minimum because they provide stable FQNs for selection, relations and Undo/Redo verification.

## Non-goals

No dynamic groups, loops, branches, step reordering, anonymous deployment instances, cascade deletion, new geometry owner, IndexedDB, ZIP persistence, grammar redesign or generic workflow engine.
