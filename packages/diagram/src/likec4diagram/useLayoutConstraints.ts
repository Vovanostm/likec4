import type { OnNodeDrag } from '@xyflow/react'
import { type FocusEventHandler, type KeyboardEventHandler, useCallback, useEffect, useMemo, useRef } from 'react'
import { filter, hasAtLeast, map, pipe } from 'remeda'
import { useXYStoreApi } from '../hooks'
import { useDiagram } from '../hooks/useDiagram'
import { createLayoutConstraints } from './layout-constraints'
import type { Types } from './types'

type LayoutConstraints = {
  onNodeDragStart: OnNodeDrag<Types.Node>
  onNodeDrag: OnNodeDrag<Types.Node>
  onNodeDragStop: OnNodeDrag<Types.Node>
  onKeyDownCapture: KeyboardEventHandler<HTMLDivElement>
  onKeyUpCapture: KeyboardEventHandler<HTMLDivElement>
  onBlurCapture: FocusEventHandler<HTMLDivElement>
}

/** Keeps pointer and keyboard movement in the renderer's constraint and snapshot lifecycle. */
export function useLayoutConstraints(enabled: boolean): LayoutConstraints {
  const xystore = useXYStoreApi()
  const diagram = useDiagram()
  const solverRef = useRef<ReturnType<typeof createLayoutConstraints>>(undefined)
  const keyboardRef = useRef(false)
  const finish = useCallback(() => {
    const solver = solverRef.current
    if (!solver) return
    if (!keyboardRef.current) solver.flushPending()
    diagram.stopEditing(solver.hasChanges())
    solverRef.current = undefined
    keyboardRef.current = false
  }, [diagram])
  const handlers = useMemo((): LayoutConstraints => {
    return {
      onNodeDragStart: (_event, xynode) => {
        finish()
        const draggingNodes = pipe(
          Array.from(xystore.getState().nodeLookup.values()),
          filter(n => n.draggable !== false && (n.dragging === true || n.id === xynode.id || n.selected === true)),
          map(n => n.id),
        )
        if (hasAtLeast(draggingNodes, 1)) {
          diagram.startEditing('node')
          solverRef.current = createLayoutConstraints(xystore, draggingNodes)
        }
      },
      onNodeDrag: () => solverRef.current?.onMove(),
      onNodeDragStop: finish,
      onKeyDownCapture: event => {
        if (!enabled || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
        const target = event.target
        if (!(target instanceof HTMLElement)) return
        // Node content can receive focus through native browser selection as well as its outer wrapper.
        // Keep those movements in the snapshot lifecycle while leaving nested controls to their own handlers.
        if (target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="textbox"]')) return
        const node = target.closest<HTMLElement>('.react-flow__node')
        if (!node) return
        const step = event.shiftKey ? 20 : 5
        let delta
        switch (event.key) {
          case 'ArrowLeft':
            delta = { x: -step, y: 0 }
            break
          case 'ArrowRight':
            delta = { x: step, y: 0 }
            break
          case 'ArrowUp':
            delta = { x: 0, y: -step }
            break
          case 'ArrowDown':
            delta = { x: 0, y: step }
            break
          default:
            return
        }
        // Prevent XYFlow's native movement: it bypasses constraints and snapshot persistence.
        event.preventDefault()
        event.stopPropagation()
        if (!solverRef.current) {
          const ids = [...xystore.getState().nodeLookup.values()]
            .filter(n => n.selected && n.draggable !== false).map(n => n.id)
          if (!hasAtLeast(ids, 1) || !ids.includes(node.dataset['id'] ?? '')) return
          diagram.startEditing('node')
          solverRef.current = createLayoutConstraints(xystore, ids)
          keyboardRef.current = true
        }
        if (keyboardRef.current) solverRef.current.moveBy(delta)
      },
      onKeyUpCapture: event => {
        if (keyboardRef.current && event.key.startsWith('Arrow')) finish()
      },
      onBlurCapture: () => {
        if (keyboardRef.current) finish()
      },
    }
  }, [xystore, diagram, enabled, finish])
  useEffect(() => {
    const onWindowBlur = () => {
      if (keyboardRef.current) finish()
    }
    window.addEventListener('blur', onWindowBlur)
    return () => {
      window.removeEventListener('blur', onWindowBlur)
      solverRef.current?.cancelPending()
      solverRef.current = undefined
      keyboardRef.current = false
    }
  }, [xystore, diagram, finish])
  return handlers
}
