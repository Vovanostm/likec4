import { expect, test } from '@playwright/test'

test('multi-selection removal is atomic and one Undo restores it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()

  const codeToggle = page.getByRole('button', { name: 'Код', exact: true })
  await codeToggle.click()
  const source = page.getByRole('textbox', { name: 'Исходный код LikeC4' })
  await expect(source).toBeVisible()
  const before = await source.inputValue()
  await codeToggle.click()

  const web = page.locator('.react-flow__node').filter({ hasText: 'Web application' }).first()
  const api = page.locator('.react-flow__node').filter({ hasText: 'API' }).first()
  await expect(web).toBeVisible()
  await expect(api).toBeVisible()
  await web.click()
  await page.keyboard.down('Control')
  await api.click()
  await page.keyboard.up('Control')
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2)

  const canvas = page.getByLabel('Холст диаграммы')
  await canvas.focus()
  await page.keyboard.press('Delete')
  const dialog = page.getByRole('dialog', { name: 'Удалить выбранные элементы?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('shop.web', { exact: true })).toBeVisible()
  await expect(dialog.getByText('shop.api', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Удалить выбранные' }).click()
  await expect(page.getByText(/Удалено элементов: 2\./)).toBeVisible()

  await codeToggle.click()
  await expect(source).toBeVisible()
  await expect.poll(async () => await source.inputValue()).not.toContain("web = component 'Web application'")
  expect(await source.inputValue()).not.toContain("api = component 'API'")

  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect.poll(async () => await source.inputValue()).toBe(before)
})
