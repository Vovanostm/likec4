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
  const handle = page.locator('.react-flow__handle.source').first()
  await expect(pane).toBeVisible()
  await expect(handle).toBeAttached()

  const paneBox = await pane.boundingBox()
  const handleBox = await handle.boundingBox()
  if (!paneBox || !handleBox) throw new Error('Canvas connection geometry is unavailable')

  const start = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  }
  const drop = {
    x: paneBox.x + Math.floor(paneBox.width * 0.78),
    y: paneBox.y + Math.floor(paneBox.height * 0.72),
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

  await expect(source).toHaveValue(/title 'Платёжный шлюз'/)
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
