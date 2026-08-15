import { expect, test } from '@playwright/test'

function relationCount(source: string): number {
  return source.match(/->/g)?.length ?? 0
}

test('connected canvas creation commits title, relation and position as one Undo/Redo action', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()

  await page.getByRole('button', { name: 'Код', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Исходный код LikeC4' })
  const before = await source.inputValue()
  const beforeRelations = relationCount(before)

  const pane = page.locator('.react-flow__pane').first()
  const handle = page.locator('.react-flow__handle.source:visible').first()
  await expect(pane).toBeVisible()
  await handle.scrollIntoViewIfNeeded()
  await expect(handle).toBeVisible()

  const handleBox = await handle.boundingBox()
  if (!handleBox) throw new Error('Visible canvas source handle has no geometry')

  const drop = await pane.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const left = Math.max(rect.left + 24, 0)
    const right = Math.min(rect.right - 24, window.innerWidth)
    const top = Math.max(rect.top + 24, 0)
    const bottom = Math.min(rect.bottom - 24, window.innerHeight)

    for (let y = bottom; y >= top; y -= 24) {
      for (let x = right; x >= left; x -= 24) {
        if (document.elementFromPoint(x, y) === element) return { x, y }
      }
    }
    return null
  })
  if (!drop) throw new Error('No visible empty canvas point is available for connection drop')

  const start = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  }

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

  await expect(source).toHaveValue(/component component 'Платёжный шлюз'/)
  const after = await source.inputValue()
  expect(after).not.toBe(before)
  expect(relationCount(after)).toBe(beforeRelations + 1)

  const undo = page.getByRole('button', { name: 'Отменить последнее изменение' })
  await undo.click()
  await expect(source).toHaveValue(before)

  const redo = page.getByRole('button', { name: 'Повторить отменённое изменение' })
  await redo.click()
  await expect(source).toHaveValue(after)
})
