import { expect, test } from '@playwright/test'

function relationCount(source: string): number {
  return source.match(/->/g)?.length ?? 0
}

test('connected canvas creation commits title, relation and position as one Undo/Redo action', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()

  const codeToggle = page.getByRole('button', { name: 'Код', exact: true })
  await codeToggle.click()
  const source = page.getByRole('textbox', { name: 'Исходный код LikeC4' })
  const before = await source.inputValue()
  const beforeRelations = relationCount(before)
  await codeToggle.click()
  await expect(source).toBeHidden()

  const pane = page.locator('.react-flow__pane').first()
  const handle = page.locator('.likec4-authoring-handle.source[data-nodeid="shop.web"]').first()
  await expect(pane).toBeVisible()
  await expect(handle).toBeVisible()

  const handleBox = await handle.boundingBox()
  if (!handleBox) throw new Error('Web application authoring handle has no geometry')
  const start = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  }
  const viewport = page.viewportSize()
  if (!viewport
    || start.x < 0
    || start.y < 0
    || start.x >= viewport.width
    || start.y >= viewport.height) {
    throw new Error('Web application authoring handle center is outside the interactive viewport')
  }

  const drop = await pane.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const left = Math.max(rect.left + 24, 24)
    const right = Math.min(rect.right - 24, window.innerWidth - 24)
    const top = Math.max(rect.top + 24, 24)
    const bottom = Math.min(rect.bottom - 24, window.innerHeight - 24)
    const blocked = Array.from(document.querySelectorAll(
      '.react-flow__node, .react-flow__controls, .react-flow__attribution',
    )).map(candidate => candidate.getBoundingClientRect())

    for (let y = bottom; y >= top; y -= 24) {
      for (let x = right; x >= left; x -= 24) {
        const overlapsInteractiveUi = blocked.some(box => (
          x >= box.left - 12
          && x <= box.right + 12
          && y >= box.top - 12
          && y <= box.bottom + 12
        ))
        if (!overlapsInteractiveUi) return { x, y }
      }
    }
    return null
  })
  if (!drop) throw new Error('No visible empty canvas point is available for connection drop')

  // Exercise the same visible authoring handle and trusted pointer sequence that a
  // user uses. The hidden centered XYFlow handles are routing infrastructure only.
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(drop.x, drop.y, { steps: 12 })
  await page.mouse.up()

  const createMenu = page.getByRole('region', { name: 'Создать элемент на холсте' })
  await expect(createMenu).toBeVisible()
  await expect(createMenu.getByRole('heading', { name: 'Создать и связать' })).toBeVisible()
  await createMenu.getByRole('button', { name: 'Компонент', exact: true }).click()

  const title = createMenu.getByRole('textbox', { name: 'Название нового элемента' })
  await expect(title).toBeFocused()
  await title.fill('Платёжный шлюз')
  await title.press('Enter')
  await expect(createMenu).toBeHidden()

  await codeToggle.click()
  await expect(source).toBeVisible()
  await expect.poll(
    async () => await source.inputValue(),
  ).toContain("component component 'Платёжный шлюз'")
  const after = await source.inputValue()
  expect(after).not.toBe(before)
  expect(relationCount(after)).toBe(beforeRelations + 1)

  const undo = page.getByRole('button', { name: 'Отменить последнее изменение' })
  await undo.click()
  await expect.poll(async () => await source.inputValue()).toBe(before)

  const redo = page.getByRole('button', { name: 'Повторить отменённое изменение' })
  await redo.click()
  await expect.poll(async () => await source.inputValue()).toBe(after)
})
