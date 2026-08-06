import type { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { patchLogicalRelationTitle, removeLogicalRelation } from './relation-source-edits'

const source = `model {
  user -> shop 'First'
  // user -> shop must stay in a comment
  user -> shop {
    // relation comment must stay
    title 'Second'
    technology 'HTTP'
  }
  shop -> user
}
`

const files = [{ uri: 'model.c4', content: source }]
const locator = {
  sourceId: 'user' as Fqn,
  targetId: 'shop' as Fqn,
  occurrence: 1,
}

describe('logical relation source edits', () => {
  it('patches the exact duplicate relation title and preserves unrelated bytes', () => {
    const result = patchLogicalRelationTitle(files, locator, 'Updated')
    expect(result[0]?.content).toBe(source.replace("title 'Second'", "title 'Updated'"))
    expect(result[0]?.content).toContain("user -> shop 'First'")
    expect(result[0]?.content).toContain('// relation comment must stay')
  })

  it('adds a positional title when the relation has none', () => {
    const result = patchLogicalRelationTitle(files, {
      sourceId: 'shop' as Fqn,
      targetId: 'user' as Fqn,
      occurrence: 0,
    }, 'Returns')
    expect(result[0]?.content).toContain("shop -> user 'Returns'")
  })

  it('removes only the selected duplicate relation block', () => {
    const result = removeLogicalRelation(files, locator)
    expect(result[0]?.content).toContain("user -> shop 'First'")
    expect(result[0]?.content).not.toContain("title 'Second'")
    expect(result[0]?.content).not.toContain("technology 'HTTP'")
    expect(result[0]?.content).toContain('// user -> shop must stay in a comment')
  })

  it('rejects a missing occurrence without changing input identity', () => {
    expect(() => removeLogicalRelation(files, { ...locator, occurrence: 9 })).toThrowError(
      expect.objectContaining({ code: 'not-found' }),
    )
    expect(files[0]?.content).toBe(source)
  })
})
