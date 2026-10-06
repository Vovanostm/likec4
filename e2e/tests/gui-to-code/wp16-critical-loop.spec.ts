import { type Page, expect, test } from '@playwright/test'
import { openPanel } from './panels'

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`keeps the entire zoom controls clickable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await importFixture(page)
    for (const name of ['Уменьшить масштаб', 'Показать всю диаграмму', 'Увеличить масштаб']) {
      const button = page.getByRole('button', { name, exact: true })
      const fullyClickable = await button.evaluate(element => {
        const rect = element.getBoundingClientRect()
        return [rect.top + 4, rect.top + rect.height / 2, rect.bottom - 4].every(y => {
          const target = document.elementFromPoint(rect.left + rect.width / 2, y)
          return target !== null && element.contains(target)
        })
      })
      expect(fullyClickable, `${name} must not be clipped by its container`).toBe(true)
      await button.click()
    }
  })
}

const fixture = `specification { element component }
model {
  // Preserve this comment and the Markdown delimiter
  api = component 'API' {
    description '''**Обрабатывает** заказы'''
    technology 'Node.js'
  }
  db = component 'База данных'
  api -> db 'Заказы'
}
views { view main { title 'Заказы' include * } }
`

async function importFixture(page: Page) {
  await page.goto('/')
  page.on('dialog', dialog => dialog.accept())
  await page.getByLabel('Открыть файл .c4').setInputFiles({
    name: 'model.c4',
    mimeType: 'text/plain',
    buffer: Buffer.from(fixture),
  })
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await expect(page.getByLabel('Текущий вид')).toHaveValue('main')
  await expect(page.getByLabel('Текущий вид').locator('option[value="index"]')).toHaveCount(0)
}

test('preserves untouched properties, applies and clears Markdown with exact history and reload', async ({ page }) => {
  await importFixture(page)
  await page.locator('.react-flow__node[data-id="api"]').click()
  await page.getByRole('region', { name: 'Холст диаграммы' }).press('Enter')
  const title = page.getByRole('textbox', { name: 'Название', exact: true })
  const description = page.getByRole('textbox', { name: 'Описание', exact: true })
  const save = page.getByRole('button', { name: 'Сохранить свойства' })
  const source = page.getByLabel('Исходный код LikeC4')
  await expect(description).toHaveValue('**Обрабатывает** заказы')
  await title.fill('API заказов')
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'unsaved')
  await save.click()
  const renamed = fixture.replace('component \'API\'', 'component \'API заказов\'')
  await expect(source).toHaveValue(renamed)
  await description.fill('Новое **описание**')
  await save.click()
  await expect(source).toHaveValue(renamed.replace('**Обрабатывает** заказы', 'Новое **описание**'))
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect(source).toHaveValue(renamed)
  await page.getByRole('button', { name: 'Повторить отменённое изменение' }).click()
  await expect(description).toHaveValue('Новое **описание**')
  await description.fill('')
  await save.click()
  await expect(source).not.toHaveValue(/description/)
  const cleared = await source.inputValue()
  expect(cleared).toContain('technology \'Node.js\'')
  expect(cleared).toContain('// Preserve this comment')
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await page.reload()
  await openPanel(page, 'Код')
  await expect(source).toHaveValue(cleared)
})

test('native drag keeps current titles, relation labels and deletion in saved manual geometry', async ({ page }) => {
  test.setTimeout(60_000)
  await importFixture(page)
  const api = page.locator('.react-flow__node[data-id="api"]')
  const box = await api.boundingBox()
  if (!box) throw new Error('API must be visible')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 65, { steps: 12 })
  await page.mouse.up()
  await expect(page.getByText('Ручная раскладка сохранена.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Режим раскладки')).toHaveValue('manual')
  const position = await api.evaluate(node => (node as HTMLElement).style.transform)
  await openPanel(page, 'Код')
  const source = page.getByLabel('Исходный код LikeC4')
  const changed = fixture.replace('component \'API\'', 'component \'Длинное актуальное название API заказов\'')
    .replace('api -> db \'Заказы\'', 'api -> db \'Актуальные заказы\'\n  db -> api \'Новая обратная связь\'')
  await source.fill(changed)
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await expect(api).toContainText('Длинное актуальное название API заказов')
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await expect(page.locator('.likec4-view')).toContainText('Новая обратная связь')
  expect(await api.evaluate(node => (node as HTMLElement).style.transform)).toBe(position)
  const removed = changed.replace('  db = component \'База данных\'\n', '')
    .replace('  api -> db \'Актуальные заказы\'\n  db -> api \'Новая обратная связь\'\n', '')
  await source.fill(removed)
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await expect(page.locator('.react-flow__edge')).toHaveCount(0)
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect(source).toHaveValue(changed)
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await page.getByRole('button', { name: 'Повторить отменённое изменение' }).click()
  await expect(source).toHaveValue(removed)
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await page.reload()
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await expect(page.locator('.react-flow__edge')).toHaveCount(0)
  expect(await api.evaluate(node => (node as HTMLElement).style.transform)).toBe(position)
})

test('new project bootstraps without source input, keeps authored view and restores after reload', async ({ page }) => {
  await page.goto('/')
  page.on('dialog', dialog => dialog.accept())
  await page.getByText('Файл и действия', { exact: true }).click()
  await page.getByRole('button', { name: 'Новый пустой проект' }).click()
  await expect(page.getByRole('button', { name: 'Отменить последнее изменение' })).toBeDisabled()
  await page.getByRole('button', { name: 'Добавить первый элемент: Компонент' }).click()
  const title = page.getByRole('textbox', { name: 'Название элемента на холсте' })
  await expect(title).toBeFocused()
  await title.fill('Первый сервис')
  await title.press('Enter')
  await expect(page.locator('.react-flow__node')).toContainText('Первый сервис')
  const view = await page.getByLabel('Текущий вид').inputValue()
  expect(view).not.toBe('index')
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await page.reload()
  await expect(page.getByLabel('Текущий вид')).toHaveValue(view)
  await expect(page.locator('.react-flow__node')).toContainText('Первый сервис')
})

const positionOf = (node: ReturnType<Page['locator']>) =>
  node.evaluate(element => (element as HTMLElement).style.transform)

test('keyboard movement commits once on release, preserves source, history and reload', async ({ page }) => {
  await importFixture(page)
  const fileMenu = page.getByText('Файл и действия', { exact: true })
  if (await fileMenu.locator('..').getAttribute('open') !== null) await fileMenu.click()
  const node = page.locator('.react-flow__node[data-id="api"]')
  await node.click()
  await node.focus()
  const before = await positionOf(node)
  await page.keyboard.down('ArrowRight')
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saving')
  await expect(page.getByRole('button', { name: 'Экспортировать ZIP', includeHidden: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Отменить последнее изменение' })).toBeDisabled()
  await page.keyboard.down('ArrowRight')
  await page.keyboard.down('ArrowRight')
  await page.keyboard.up('ArrowRight')
  await expect(page.getByText('Ручная раскладка сохранена.', { exact: true })).toBeVisible()
  const moved = await positionOf(node)
  expect(moved).not.toBe(before)
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect.poll(() => positionOf(node)).toBe(before)
  await page.getByRole('button', { name: 'Повторить отменённое изменение' }).click()
  await expect.poll(() => positionOf(node)).toBe(moved)
  await openPanel(page, 'Код')
  await expect(page.getByLabel('Исходный код LikeC4')).toHaveValue(fixture)
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await page.reload()
  await expect.poll(() => positionOf(node)).toBe(moved)
})

test('keyboard focus loss saves movement and Shift-arrow placement survives ZIP', async ({ page }) => {
  await importFixture(page)
  const node = page.locator('.react-flow__node[data-id="api"]')
  await node.click()
  await node.focus()
  await page.keyboard.down('ArrowDown')
  await page.getByRole('button', { name: 'Показать всю диаграмму' }).click()
  await page.keyboard.up('ArrowDown')
  await expect(page.getByText('Ручная раскладка сохранена.', { exact: true })).toBeVisible()
  const before = await positionOf(node)
  await node.focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect.poll(() => positionOf(node)).not.toBe(before)
  const moved = await positionOf(node)
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await page.getByText('Файл и действия', { exact: true }).click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспортировать ZIP' }).click()
  const download = await downloadEvent
  const path = await download.path()
  if (!path) throw new Error('ZIP export must succeed')
  await page.getByLabel('Импортировать архив рабочего пространства').setInputFiles(path)
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await expect.poll(() => positionOf(node)).toBe(moved)
  await page.reload()
  await expect.poll(() => positionOf(node)).toBe(moved)
})

test('moves a compound and its child with renderer constraints and restores both after reload', async ({ page }) => {
  await page.goto('/')
  page.on('dialog', dialog => dialog.accept())
  const nested = `specification { element system element component }
model { system = system { api = component 'API' db = component 'DB' } }
views { view nested { include system, system.* } }`
  await page.getByLabel('Открыть файл .c4').setInputFiles({
    name: 'nested.c4',
    mimeType: 'text/plain',
    buffer: Buffer.from(nested),
  })
  const parent = page.locator('.react-flow__node[data-id="system"]')
  const child = page.locator('.react-flow__node[data-id="system.api"]')
  await expect(child).toBeVisible()
  await expect(parent).toBeVisible()
  // Select the compound through the structure to avoid hitting one of its children.
  await openPanel(page, 'Структура')
  await page.locator('.structure-item').filter({ has: page.locator('code', { hasText: /^system$/ }) }).click()
  await page.getByRole('button', { name: 'Структура', exact: true }).click()
  await parent.focus()
  const beforeParent = await positionOf(parent)
  const sibling = page.locator('.react-flow__node[data-id="system.db"]')
  const coordinates = (node: ReturnType<Page['locator']>) =>
    node.evaluate(element => {
      // XYFlow renders nested nodes at absolute positions, despite storing parent-relative geometry.
      const matrix = new DOMMatrixReadOnly((element as HTMLElement).style.transform)
      return { x: matrix.m41, y: matrix.m42 }
    })
  const parentCoordinates = await coordinates(parent)
  const childCoordinates = await coordinates(child)
  const siblingCoordinates = await coordinates(sibling)
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  const movedParent = await positionOf(parent)
  expect(movedParent).not.toBe(beforeParent)
  expect(await coordinates(parent)).toEqual({ x: parentCoordinates.x + 20, y: parentCoordinates.y })
  expect(await coordinates(child)).toEqual({ x: childCoordinates.x + 20, y: childCoordinates.y })
  expect(await coordinates(sibling)).toEqual({ x: siblingCoordinates.x + 20, y: siblingCoordinates.y })
  const movedSibling = await positionOf(sibling)
  const movedChild = await coordinates(child)
  await child.click()
  await child.focus()
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  const adjustedParent = await positionOf(parent)
  const adjustedChild = await positionOf(child)
  expect(await coordinates(child)).toEqual({ x: movedChild.x - 20, y: movedChild.y })
  expect(await positionOf(sibling)).toBe(movedSibling)
  await page.reload()
  await expect.poll(() => positionOf(parent)).toBe(adjustedParent)
  await expect.poll(() => positionOf(child)).toBe(adjustedChild)
  await expect.poll(() => positionOf(sibling)).toBe(movedSibling)
})

test('invalid draft prevents keyboard placement and context mutations without changing the valid diagram', async ({ page }) => {
  await importFixture(page)
  const node = page.locator('.react-flow__node[data-id="api"]')
  await node.click()
  await openPanel(page, 'Код')
  await page.getByLabel('Исходный код LikeC4').fill(fixture + '\nmodel { broken =')
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'invalid')
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  await node.focus()
  const before = await positionOf(node)
  await page.keyboard.press('ArrowRight')
  expect(await positionOf(node)).toBe(before)
  await node.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Действия выбранной сущности' })
  await expect(menu.getByRole('menuitem', { name: 'Изменить название' })).toBeDisabled()
  await expect(menu.getByRole('menuitem', { name: 'Удалить' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Отменить последнее изменение' })).toBeDisabled()
})

test('window focus loss finishes a held keyboard move and preserves its snapshot after reload', async ({ page }) => {
  await importFixture(page)
  const node = page.locator('.react-flow__node[data-id="api"]')
  await node.click()
  await node.focus()
  const before = await positionOf(node)
  await page.keyboard.down('ArrowRight')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.keyboard.up('ArrowRight')
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  const moved = await positionOf(node)
  expect(moved).not.toBe(before)
  await page.reload()
  await expect.poll(() => positionOf(node)).toBe(moved)
})

test('tree selection replaces the renderer selection before keyboard placement', async ({ page }) => {
  await importFixture(page)
  const api = page.locator('.react-flow__node[data-id="api"]')
  const db = page.locator('.react-flow__node[data-id="db"]')
  await api.click()
  const beforeApi = await positionOf(api)
  const beforeDb = await positionOf(db)
  await openPanel(page, 'Структура')
  await page.locator('.structure-item').filter({ has: page.locator('code', { hasText: /^db$/ }) }).click()
  await page.getByRole('button', { name: 'Структура', exact: true }).click()
  await expect(db).toHaveClass(/selected/)
  await expect(api).not.toHaveClass(/selected/)
  await db.focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  expect(await positionOf(api)).toBe(beforeApi)
  expect(await positionOf(db)).not.toBe(beforeDb)
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect.poll(() => positionOf(db)).toBe(beforeDb)
})
