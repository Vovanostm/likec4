import { fromSources } from '@likec4/language-services/browser'
import type { CompileRequest, CompileResult } from './editor/contracts'

/** The only browser compiler boundary used by the UI. */
export async function compile(request: CompileRequest): Promise<CompileResult> {
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
