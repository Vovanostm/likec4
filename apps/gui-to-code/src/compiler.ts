import type { LikeC4Model } from '@likec4/core/model'
import { fromSource } from '@likec4/language-services/browser'

export interface Compilation {
  errors: string[]
  model: LikeC4Model.Layouted | null
}

/** The only browser compiler boundary used by the UI. */
export async function compile(source: string): Promise<Compilation> {
  try {
    const likec4 = await fromSource(source)
    const errors = likec4.getErrors().map(error => `Line ${error.line + 1}: ${error.message}`)
    if (errors.length > 0) return { errors, model: null }
    return { errors: [], model: await likec4.layoutedModel() }
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)], model: null }
  }
}
