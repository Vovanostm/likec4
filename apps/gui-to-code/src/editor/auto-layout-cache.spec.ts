import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { starterSource } from '../document'
import { currentAutoLayout } from './auto-layout-cache'
import { EditorWorkspace } from './workspace'

describe('automatic layout revision ownership', () => {
  it('never renders a previous workspace even when revision and source identity match', async () => {
    const owner = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    const replacement = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    const cache = {
      owner,
      revision: owner.state.revision,
      sources: owner.state.committedSources,
      model: owner.state.lastValidModel,
    }
    expect(currentAutoLayout(cache, owner, owner.state)).toBe(cache.model)
    expect(currentAutoLayout(cache, replacement, owner.state)).toBeNull()
    expect(currentAutoLayout(cache, owner, { ...owner.state, revision: owner.state.revision + 1 })).toBeNull()
    expect(currentAutoLayout(cache, owner, {
      ...owner.state,
      committedSources: [...owner.state.committedSources],
    })).toBeNull()
    expect(currentAutoLayout(cache, replacement, replacement.state)).toBeNull()
    expect(currentAutoLayout(null, owner, owner.state)).toBeNull()
  })
})
