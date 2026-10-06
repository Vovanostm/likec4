import type { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { locateElementSource } from './element-source'
import {
  reconcileSourceDocument,
  sourcePositionOffset,
  sourceWithOriginalLineEndings,
  workspaceSourceUri,
} from './source-documents'

const sources = [
  { uri: 'specification.c4', content: 'specification { element system element component }' },
  { uri: 'landscape.c4', content: 'model { shop = system \'Магазин\' }' },
  {
    uri: 'domains/заказы/model.c4',
    content: '// Сохранённый комментарий\r\nmodel { extend shop { api = component \'API\' } }',
  },
  { uri: 'views.c4', content: 'views { view overview { include * } }' },
]

describe('multi-file source navigation', () => {
  it('retains consistent CRLF when native textarea input normalizes line endings', () => {
    expect(sourceWithOriginalLineEndings('// original\r\nmodel {}\r\n', '// edited\nmodel {}\n'))
      .toBe('// edited\r\nmodel {}\r\n')
    expect(sourceWithOriginalLineEndings('model {}\n', 'model {}\n// edited\n')).toBe('model {}\n// edited\n')
  })
  it('opens the exact compiler-owned declaration in an extension file, including Unicode paths and CRLF', async () => {
    const location = await locateElementSource(sources, 'shop.api' as Fqn)
    if (!location) throw new Error('Missing compiler location')
    expect(location.uri).toBe('domains/заказы/model.c4')
    const source = sources.find(source => source.uri === location.uri)!
    expect(source.content.slice(
      sourcePositionOffset(source.content, location.range.start),
      sourcePositionOffset(source.content, location.range.end),
    )).toBe('api')
    expect(await locateElementSource(sources, 'missing' as Fqn)).toBeNull()
  })

  it('identifies the non-entry document in compiler diagnostics without replacing the last valid graph', async () => {
    const valid = await compile({ revision: 0, sources })
    expect(valid.model).not.toBeNull()
    const invalid = await compile({
      revision: 1,
      sources: sources.map(source =>
        source.uri === 'domains/заказы/model.c4'
          ? { ...source, content: 'model { broken !!! }' }
          : source
      ),
    })
    expect(invalid.model).toBeNull()
    expect(invalid.diagnostics.length).toBeGreaterThan(0)
    expect(invalid.diagnostics.every(diagnostic => diagnostic.uri === 'domains/заказы/model.c4')).toBe(true)
  })

  it('resolves full paths without confusing equal basenames or decoding literal diagnostic percent signs', () => {
    const files = [{ uri: 'a/model.c4', content: '' }, { uri: 'b/model.c4', content: '' }, {
      uri: '50%/file.c4',
      content: '',
    }]
    expect(workspaceSourceUri('virtual:/workspace/b/model.c4', files)).toBe('b/model.c4')
    expect(workspaceSourceUri('/workspace/50%/file.c4', files)).toBe('50%/file.c4')
    expect(workspaceSourceUri('virtual:/workspace/50%25/file.c4', files)).toBe('50%/file.c4')
    expect(workspaceSourceUri('virtual:/workspace/bad%ZZ', files)).toBeNull()
    expect(workspaceSourceUri('/other/b/model.c4', files)).toBeNull()
    expect(workspaceSourceUri('model.c4', files)).toBeNull()
    expect(reconcileSourceDocument('removed.c4', files, 'b/model.c4')).toBe('b/model.c4')
    expect(reconcileSourceDocument('a/model.c4', files, 'b/model.c4')).toBe('a/model.c4')
  })
})
