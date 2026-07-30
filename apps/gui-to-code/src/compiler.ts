import type { LikeC4Model } from '@likec4/core/model'
import { fromSources } from '@likec4/language-services/browser'
import type { CompileRequest, CompileResult } from './editor/contracts'

export interface Compilation {
  readonly errors: string[]
  readonly model: LikeC4Model.Layouted | null
}

async function compileRequest(request: CompileRequest): Promise<CompileResult> {
  try {
    const likec4 = await fromSources(Object.fromEntries(request.sources.map(source => [source.uri, source.content])))
    const diagnostics = likec4.getErrors().map(error => ({
      line: error.line + 1,
      message: error.message,
    }))
    if (diagnostics.length > 0) {
      return { revision: request.revision, diagnostics, model: null }
    }
    return {
      revision: request.revision,
      diagnostics: [],
      model: await likec4.layoutedModel(),
    }
  } catch (error) {
    return {
      revision: request.revision,
      diagnostics: [{ message: error instanceof Error ? error.message : String(error) }],
      model: null,
    }
  }
}

export function compile(source: string): Promise<Compilation>
export function compile(request: CompileRequest): Promise<CompileResult>
/** The only browser compiler boundary used by the UI. */
export async function compile(request: string | CompileRequest): Promise<Compilation | CompileResult> {
  if (typeof request === 'string') {
    const result = await compileRequest({
      revision: 0,
      sources: [{ uri: 'model.c4', content: request }],
    })
    return {
      errors: result.diagnostics.map(diagnostic =>
        diagnostic.line ? `Line ${diagnostic.line}: ${diagnostic.message}` : diagnostic.message
      ),
      model: result.model,
    }
  }
  return compileRequest(request)
}
