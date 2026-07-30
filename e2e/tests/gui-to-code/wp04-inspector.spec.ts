import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()
})

test('edits, renames and safely removes one selected element with keyboard history', async ({ page }) => {
  const treeItem = page.getByRole('button', { name: /Web application.*shop\.web/ })
  await treeItem.click()

  const title = page.getByLabel('Название', { exact: true })
  await expect(title).toHaveValue('Web application')
  await title.fill('Storefront')
  await page.getByRole('button', { name: 'Сохранить свойства' }).click()
  await expect(page.getByLabel('Исходный код LikeC4')).toContainText("title 'Storefront'")

  const localId = page.getByLabel('Локальный ID')
  await localId.fill('client')
  await page.getByRole('button', { name: 'Переименовать' }).click()
  const renamedTreeItem = page.getByRole('button', { name: /Storefront.*shop\.client/ })
  await expect(renamedTreeItem).toBeVisible()
  await expect(page.getByLabel('Исходный код LikeC4')).toContainText('component client')

  await renamedTreeItem.focus()
  await renamedTreeItem.press('Delete')
  const dialog = page.getByRole('dialog', { name: 'Удалить элемент?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Будут также удалены зависимости:')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(renamedTreeItem).toBeFocused()

  await renamedTreeItem.press('Delete')
  await dialog.getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(renamedTreeItem).toHaveCount(0)

  await page.getByRole('button', { name: 'Отменить' }).click()
  await expect(page.getByRole('button', { name: /Storefront.*shop\.client/ })).toBeVisible()

  await page.getByRole('button', { name: 'Повторить' }).click()
  await expect(page.getByRole('button', { name: /Storefront.*shop\.client/ })).toHaveCount(0)
})
