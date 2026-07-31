import type { LangiumDocument } from 'langium'

export function selectViewDocument(
  documents: readonly LangiumDocument[],
  requestedPath: string | null,
): LangiumDocument | undefined {
  if (requestedPath) {
    return documents.find(document => document.uri.path.endsWith(`/${requestedPath}`))
  }
  return documents.find(document => {
    const root = document.parseResult.value as { readonly views?: readonly unknown[] }
    return Boolean(root.views?.length)
  }) ?? documents.find(document => {
    const root = document.parseResult.value as { readonly models?: readonly unknown[] }
    return Boolean(root.models?.length)
  })
}
