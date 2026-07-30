import { describe, expect, it } from 'vitest'
import { applyTextEdits, identifierEdits, inspectRemoval } from './source-edits'

describe('source-preserving edit proof', () => {
  it('changes only typed identifier ranges and preserves comments', () => {
    const source = "// shop stays in this comment\nmodel {\n  shop = system 'Shop'\n  user -> shop\n}\nviews { view index of shop { include shop } }\n"
    const ranges = [...source.matchAll(/\bshop\b/g)]
      .filter(match => !source.slice(0, match.index).endsWith('// '))
      .map(match => ({ start: match.index, end: match.index + match[0].length }))
    const result = applyTextEdits(source, identifierEdits(source, ranges, 'store'))
    expect(result).toContain('// shop stays in this comment')
    expect(result).toContain("store = system 'Shop'")
    expect(result).toContain('user -> store')
    expect(result).toContain('view index of store { include store }')
  })

  it('applies insertions without reformatting neighboring text', () => {
    const source = "model {\n  // preserved\n  existing=component 'Existing'\n}\n"
    const position = source.lastIndexOf('}')
    const result = applyTextEdits(source, [{ start: position, end: position, text: "  added = component 'Added'\n" }])
    expect(result).toBe("model {\n  // preserved\n  existing=component 'Existing'\n  added = component 'Added'\n}\n")
  })

  it('blocks removal when typed dependencies exist', () => {
    expect(inspectRemoval([{ start: 10, end: 14 }])).toEqual({
      status: 'blocked',
      dependencies: [{ start: 10, end: 14 }],
    })
    expect(inspectRemoval([])).toEqual({ status: 'safe' })
  })
})
