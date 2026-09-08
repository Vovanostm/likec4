import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function sourceEditor(page: Page) {
  const toggle = page.getByRole('button', { name: 'Код', exact: true })
  await toggle.click()
  const source = page.getByRole('textbox', { name: 'Исходный код LikeC4' })
  await expect(source).toBeVisible()
  return { toggle, source }
}

async function selectWebApplication(page: Page) {
  const node = page.locator('.react-flow__node').filter({ hasText: 'Web application' }).first()
  await expect(node).toBeVisible()
  await node.click()
  const canvas = page.getByLabel('Холст диаграммы')
  await canvas.focus()
  return { node, canvas }
}

test('Copy/Paste is atomic, repeatable and Undo restores one paste at a time', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()

  const editor = await sourceEditor(page)
  const before = await editor.source.inputValue()
  await editor.toggle.click()
  await expect(editor.source).toBeHidden()

  const { canvas } = await selectWebApplication(page)
  await page.keyboard.press('Control+c')
  await expect(page.getByText('Элемент скопирован.', { exact: true })).toBeVisible()

  await page.keyboard.press('Control+v')
  await expect(page.getByText('Элемент вставлен.', { exact: true })).toBeVisible()
  await canvas.focus()
  await page.keyboard.press('Control+v')
  await expect(page.getByText('Элемент вставлен.', { exact: true })).toBeVisible()

  await editor.toggle.click()
  await expect(editor.source).toBeVisible()
  await expect.poll(async () => await editor.source.inputValue()).toContain("web2 = component 'Web application'")
  const afterTwoPastes = await editor.source.inputValue()
  expect(afterTwoPastes).toContain("web3 = component 'Web application'")

  const undo = page.getByRole('button', { name: 'Отменить последнее изменение' })
  await undo.click()
  await expect.poll(async () => await editor.source.inputValue()).not.toContain('web3 = component')
  expect(await editor.source.inputValue()).toContain("web2 = component 'Web application'")

  await undo.click()
  await expect.poll(async () => await editor.source.inputValue()).toBe(before)
})

test('node context menu duplicates the selected element through one workspace transaction', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()

  const editor = await sourceEditor(page)
  const before = await editor.source.inputValue()
  await editor.toggle.click()

  const node = page.locator('.react-flow__node').filter({ hasText: 'Web application' }).first()
  await expect(node).toBeVisible()
  await node.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Меню элемента' })
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Дублировать' }).click()
  await expect(page.getByText('Элемент продублирован.', { exact: true })).toBeVisible()

  await editor.toggle.click()
  await expect.poll(async () => await editor.source.inputValue()).toContain("web2 = component 'Web application'")
  const after = await editor.source.inputValue()
  expect(after).not.toBe(before)

  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect.poll(async () => await editor.source.inputValue()).toBe(before)
})
