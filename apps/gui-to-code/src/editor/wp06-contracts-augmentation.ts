import type { Fqn } from '@likec4/core/types'

// Kept as a module augmentation so WP-06 can extend the existing editor contract
// without duplicating or replacing the owning contracts module.
declare module './contracts' {
  interface CreateDeploymentInstanceEditInput {
    readonly parentId: Fqn
  }
}

export {}
