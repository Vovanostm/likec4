import type * as t from '@likec4/core/types'
import type { CanvasIntentHandler } from './CanvasIntent'

/**
 * Callbacks from LikeC4 Editor.
 */
export interface LikeC4EditorCallbacks {
  /**
   * Apply semantic layout to a view (if AI is available)
   * See vite-plugin settings for more details
   */
  applySemanticLayout?: undefined | ((viewId: t.ViewId) => Promise<void>)

  /**
   * Optional callback for transient canvas interaction intents.
   *
   * The diagram never applies semantic document changes itself. Consumers may
   * translate these intents into their own validated document operations.
   */
  onCanvasIntent?: CanvasIntentHandler

  /**
   * Fetch a view by its ID and layout type.
   *
   * @param viewId - The ID of the view to fetch.
   * @param layout - The layout type to use when fetching the view.
   */
  fetchView(viewId: t.ViewId, layout?: t.LayoutType): t.LayoutedView | Promise<t.LayoutedView>

  /**
   * Callback invoked when the view changes.
   */
  handleChange(viewId: t.ViewId, change: t.ViewChange): void | Promise<void>
}

export function createLikeC4Editor(callbacks: LikeC4EditorCallbacks): LikeC4EditorCallbacks {
  return callbacks
}
