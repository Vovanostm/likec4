import { describe, expect, it } from 'vitest'
import { resolveEditorShortcut } from './editor-shortcuts'

const canvasContext = {
  editingText: false,
  inOverlay: false,
  interactive: false,
  inCanvas: true,
  inStructure: false,
  activeCreation: false,
  canMutate: true,
}

describe('editor keyboard routing', () => {
  it.each([
    [{ key: 'z', ctrlKey: true }, 'undo'],
    [{ key: 'z', metaKey: true, shiftKey: true }, 'redo'],
    [{ key: 'y', ctrlKey: true }, 'redo'],
    [{ key: 'я', code: 'KeyZ', metaKey: true }, 'undo'],
    [{ key: 'c', ctrlKey: true }, 'copy'],
    [{ key: 'v', metaKey: true }, 'paste'],
    [{ key: 'd', ctrlKey: true }, 'duplicate'],
    [{ key: 'a', ctrlKey: true }, 'select-all'],
  ])('routes history shortcuts on the canvas: %j', (event, action) => {
    expect(resolveEditorShortcut(event, canvasContext)).toEqual({ action })
  })

  it.each(['c', 'v', 'd', 'a', 'z', 'y', 'Delete', 'Backspace', 'F2', 'Enter', 'Escape', '1', 'l'])(
    'leaves %s inside a text editor',
    key => {
      expect(resolveEditorShortcut({ key, ctrlKey: ['c', 'v', 'd', 'a', 'z', 'y'].includes(key) }, {
        ...canvasContext,
        editingText: true,
      })).toBeNull()
    },
  )

  it.each(['Delete', 'Enter', 'Escape', '1', 'l', 'z'])('isolates %s in dialogs and menus', key => {
    expect(resolveEditorShortcut({ key, ctrlKey: key === 'z' }, { ...canvasContext, inOverlay: true })).toBeNull()
  })

  it.each(['Enter', 'Delete', 'Backspace', 'F2', '1', 'l'])('leaves native control activation intact: %s', key => {
    expect(resolveEditorShortcut({ key }, { ...canvasContext, interactive: true })).toBeNull()
  })

  it('keeps canvas tools scoped to the canvas and accepts physical keys with a Russian layout', () => {
    expect(resolveEditorShortcut({ key: 'д', code: 'KeyL' }, canvasContext)).toEqual({ action: 'connect' })
    expect(resolveEditorShortcut({ key: 'м', code: 'KeyV' }, canvasContext)).toEqual({ action: 'select' })
    expect(resolveEditorShortcut({ key: '1' }, canvasContext)).toEqual({ action: 'create', kind: 'actor' })
    expect(resolveEditorShortcut({ key: '2' }, canvasContext)).toEqual({ action: 'create', kind: 'system' })
    expect(resolveEditorShortcut({ key: '3' }, canvasContext)).toEqual({ action: 'create', kind: 'component' })
    expect(resolveEditorShortcut({ key: 'l' }, { ...canvasContext, inCanvas: false })).toBeNull()
  })

  it.each(['1', 'l', 'Delete', 'F2', 'z'])('blocks mutations while busy, invalid or read-only: %s', key => {
    expect(resolveEditorShortcut({ key, ctrlKey: key === 'z' }, { ...canvasContext, canMutate: false })).toBeNull()
  })

  it('allows selecting, cancelling and inspecting without mutating a read-only workspace', () => {
    const context = { ...canvasContext, canMutate: false }
    expect(resolveEditorShortcut({ key: 'v' }, context)).toEqual({ action: 'select' })
    expect(resolveEditorShortcut({ key: 'Escape' }, context)).toEqual({ action: 'cancel' })
    expect(resolveEditorShortcut({ key: 'Enter' }, context)).toEqual({ action: 'edit' })
  })

  it('opens tree properties instead of creating an element when a creation tool is active', () => {
    const context = { ...canvasContext, activeCreation: true }
    expect(resolveEditorShortcut({ key: 'Enter' }, context)).toEqual({ action: 'create-at-center' })
    expect(resolveEditorShortcut({ key: 'Enter' }, { ...context, inStructure: true })).toEqual({ action: 'edit' })
    expect(resolveEditorShortcut({ key: 'Enter' }, { ...context, canMutate: false })).toBeNull()
  })

  it.each([
    { key: '1', altKey: true },
    { key: '1', ctrlKey: true },
    { key: '1', shiftKey: true },
    { key: 'Delete', repeat: true },
    { key: 'z', ctrlKey: true, isComposing: true },
    { key: 'z', ctrlKey: true, nativeEvent: { isComposing: true } },
    { key: 'z', ctrlKey: true, defaultPrevented: true },
  ])('does not dispatch repeated, composing, consumed or unrelated modified keys: %j', event => {
    expect(resolveEditorShortcut(event, canvasContext)).toBeNull()
  })
})
