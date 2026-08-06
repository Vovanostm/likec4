import { expect, test } from '@playwright/test'

test('creates and edits a scoped element directly on the canvas with exact Undo/Redo', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()
  const pane = page.locator('.react-flow__pane').first()
  await expect(pane).toBeVisible()

  const box = await pane.boundingBox()
  if (!box) throw new Error('Canvas pane has no bounding box')
  await pane.dblclick({ position: { x: Math.floor(box.width * 0.72), y: Math.floor(box.height * 0.68) } })

  const createMenu = page.getByRole('region', { name: 'Создать элемент на холсте' })
  await expect(createMenu).toBeVisible()
  await createMenu.getByRole('button', { name: 'Компонент', exact: true }).click()

  const inlineTitle = page.getByRole('textbox', { name: 'Название элемента на холсте' })
  await expect(inlineTitle).toBeVisible()
  await inlineTitle.fill('Платёжный модуль')
  await inlineTitle.press('Enter')
  await expect(inlineTitle).toBeHidden()

  await page.getByRole('button', { name: 'Код', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Исходный код LikeC4' })
  await expect(source).toHaveValue(/component = component 'Платёжный модуль'/)

  const undo = page.getByRole('button', { name: 'Отменить последнее изменение' })
  await undo.click()
  await expect(source).toHaveValue(/component = component 'component'/)
  await undo.click()
  await expect(source).not.toHaveValue(/component = component/)

  const redo = page.getByRole('button', { name: 'Повторить отменённое изменение' })
  await redo.click()
  await expect(source).toHaveValue(/component = component 'component'/)
  await redo.click()
  await expect(source).toHaveValue(/component = component 'Платёжный модуль'/)
})
