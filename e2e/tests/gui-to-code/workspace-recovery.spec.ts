import { type Page, expect, test } from '@playwright/test'
import { openPanel } from './panels'

async function openWorkspace(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await page.getByRole('button', { name: 'Код', exact: true }).click()
}

async function durableRecords(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('likec4-gui-to-code', 3)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const transaction = database.transaction('workspace', 'readonly')
      const store = transaction.objectStore('workspace')
      return await Promise.all(['active', 'backup', 'metadata'].map(key =>
        new Promise<unknown>((resolve, reject) => {
          const request = store.get(key)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      ))
    } finally {
      database.close()
    }
  })
}

test('same-revision import survives a stale second page and its subsequent edit attempts', async ({ page, context }) => {
  await openWorkspace(page)
  const stale = await context.newPage()
  await openWorkspace(stale)
  const staleSource = stale.getByRole('textbox', { name: 'Исходный код LikeC4' })
  const original = await staleSource.inputValue()
  const imported = `// imported exact bytes\r\n${original}`
  page.on('dialog', dialog => dialog.accept())
  await page.getByLabel('Открыть файл .c4').setInputFiles({
    name: 'imported.c4',
    mimeType: 'text/plain',
    buffer: Buffer.from(imported),
  })
  await expect(page.getByRole('textbox', { name: 'Исходный код LikeC4' })).toHaveValue(
    imported.replaceAll('\r\n', '\n'),
  )
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  const afterImport = await durableRecords(page)
  expect(JSON.stringify(afterImport[0])).toContain(JSON.stringify(imported).slice(1, -1))

  await staleSource.fill(`${original}\n// stale mutation`)
  await expect(stale.locator('.save-status')).toHaveAttribute('data-status', 'conflict')
  await expect(stale.getByRole('button', { name: 'Загрузить актуальную версию' })).toBeVisible()
  await expect(staleSource).toHaveAttribute('readonly', '')
  await expect(stale.getByRole('button', { name: 'Отменить последнее изменение' })).toBeDisabled()
  await openPanel(stale, 'Структура')
  await stale.getByRole('button', { name: /Web application.*shop\.web/ }).click()
  await openPanel(stale, 'Инспектор')
  const inspector = stale.getByRole('region', { name: 'Инспектор элемента' })
  await expect(inspector.getByLabel('Название', { exact: true })).toBeDisabled()
  await expect(inspector.getByRole('button', { name: 'Сохранить свойства' })).toBeDisabled()
  await expect(inspector.getByRole('button', { name: 'Удалить элемент' })).toBeDisabled()
  await expect(stale.getByRole('button', { name: 'Создать вид', exact: true })).toBeDisabled()
  await stale.getByText('Дополнительно', { exact: true }).click()
  await expect(stale.getByLabel('Импортировать раскладку')).toBeDisabled()
  await expect(stale.getByRole('button', { name: 'Сбросить раскладку' })).toBeDisabled()
  expect(await durableRecords(page)).toEqual(afterImport)

  await test.info().attach('stale-desktop-before-code', { body: await stale.screenshot(), contentType: 'image/png' })
  await openPanel(stale, 'Код')
  const localSource = await staleSource.inputValue()
  stale.once('dialog', dialog => dialog.dismiss())
  await stale.getByRole('button', { name: 'Загрузить актуальную версию' }).click()
  await expect(staleSource).toHaveValue(localSource)
  await expect(stale.locator('.save-status')).toHaveAttribute('data-status', 'conflict')
  expect(await durableRecords(page)).toEqual(afterImport)

  stale.once('dialog', dialog => dialog.accept())
  await stale.getByRole('button', { name: 'Загрузить актуальную версию' }).click()
  await expect(staleSource).toHaveValue(imported.replaceAll('\r\n', '\n'))
  await expect(stale.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await page.reload()
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Исходный код LikeC4' })).toHaveValue(
    imported.replaceAll('\r\n', '\n'),
  )
})

test('corrupt active recovers valid backup, rotates token, then accepts another save', async ({ page }) => {
  await openWorkspace(page)
  const source = page.getByRole('textbox', { name: 'Исходный код LikeC4' })
  const original = await source.inputValue()
  await source.fill(`${original}\n// changed valid source`)
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  const before = await durableRecords(page)
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('likec4-gui-to-code', 3)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('workspace', 'readwrite')
    transaction.objectStore('workspace').put({ corrupt: true }, 'active')
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
  })
  await page.reload()
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  await expect(source).toHaveValue(original)
  const recovered = await durableRecords(page)
  expect(recovered[0]).toEqual(before[1])
  expect(recovered[1]).toEqual(before[1])
  expect(recovered[2]).not.toEqual(before[2])
  await source.fill(`${original}\n// after recovery`)
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await page.reload()
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  await expect(source).toHaveValue(`${original}\n// after recovery`)
})
