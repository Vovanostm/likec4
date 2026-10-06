import { type Locator, type Page, expect, test } from '@playwright/test'
import { openPanel } from './panels'

async function emptyCanvasPoint(page: Page): Promise<{ x: number; y: number }> {
  const pane = page.locator('.react-flow__pane').first()
  await expect(pane).toBeVisible()
  const point = await pane.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const root = element.getRootNode() as Node & { elementFromPoint?: (x: number, y: number) => Element | null }
    for (let y = Math.min(rect.bottom - 24, window.innerHeight - 24); y > Math.max(rect.top + 24, 24); y -= 24) {
      for (let x = Math.min(rect.right - 24, window.innerWidth - 24); x > Math.max(rect.left + 24, 24); x -= 24) {
        if (root.elementFromPoint?.(x, y) === element) return { x, y }
      }
    }
    return null
  })
  if (!point) throw new Error('No visible empty canvas point')
  return point
}

async function openInlineTitle(page: Page): Promise<Locator> {
  await openPanel(page, 'Структура')
  const element = page.locator('button[data-element-id="shop.web"]')
  await element.focus()
  await element.press('F2')
  const title = page.getByRole('textbox', { name: 'Название элемента на холсте' })
  await expect(title).toBeFocused()
  return title
}

async function composingKey(input: Locator, key: 'Enter' | 'Escape'): Promise<boolean> {
  // Synthetic events are restricted to IME regression; all focus and command flows use normal keyboard/pointer input.
  return input.evaluate((element, key) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, isComposing: true })
    element.dispatchEvent(event)
    return event.defaultPrevented
  }, key)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__pane').first()).toBeVisible()
})

for (const action of ['button', 'escape'] as const) {
  test(`clears native and host selection through ${action} without moving the former selection`, async ({ page }) => {
    const element = page.locator('.react-flow__node[data-id="customer"]')
    await element.click()
    await expect(element).toHaveClass(/selected/)
    const transform = await element.evaluate(node => node.style.transform)
    const source = await page.getByLabel('Исходный код LikeC4').inputValue()

    if (action === 'button') {
      await element.click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Снять выделение' }).click()
    } else await element.press('Escape')

    await expect(page.getByRole('menu', { name: 'Действия выбранной сущности', exact: true })).toBeHidden()
    await expect(page.locator('.react-flow__node.selected, .react-flow__edge.selected')).toHaveCount(0)
    await element.focus()
    await element.press('Shift+ArrowDown')
    expect(await element.evaluate(node => node.style.transform)).toBe(transform)
    await expect(page.getByLabel('Исходный код LikeC4')).toHaveValue(source)
  })
}

test('inline Tab stays inside the form; explicit save creates one undoable patch', async ({ page }) => {
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  const source = page.getByLabel('Исходный код LikeC4')
  const before = await source.inputValue()
  const title = await openInlineTitle(page)
  await title.fill('Клавиатурное название')
  const form = page.getByRole('form', { name: 'Изменить название элемента shop.web' })
  await page.keyboard.press('Tab')
  await expect(form.getByRole('button', { name: 'Сохранить', exact: true })).toBeFocused()
  await expect(title).toHaveValue('Клавиатурное название')
  await page.keyboard.press('Shift+Tab')
  await expect(title).toBeFocused()
  await expect(source).toHaveValue(before)
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(title).toBeHidden()
  await expect(page.getByRole('region', { name: 'Холст диаграммы' })).toBeFocused()
  await expect(source).toHaveValue(/web = component 'Клавиатурное название'/)
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect(source).toHaveValue(before)
})

test('outside blur saves once and preserves the clicked control focus; empty draft stays recoverable', async ({ page }) => {
  const title = await openInlineTitle(page)
  await title.fill('Сохранено при уходе')
  const code = page.getByRole('button', { name: 'Код', exact: true })
  await code.click()
  await expect(title).toBeHidden()
  await expect(code).toBeFocused()
  const source = page.getByLabel('Исходный код LikeC4')
  await expect(source).toHaveValue(/web = component 'Сохранено при уходе'/)
  const committed = await source.inputValue()
  const empty = await openInlineTitle(page)
  await empty.fill('')
  await code.focus()
  await expect(empty).toBeVisible()
  await expect(empty).toHaveValue('')
  await expect(source).toHaveValue(committed)
  await empty.focus()
  await empty.press('Escape')
  await expect(empty).toBeHidden()
  await expect(source).toHaveValue(committed)
})

test('inline IME Enter and Escape remain unconsumed, then ordinary Enter saves once', async ({ page }) => {
  const title = await openInlineTitle(page)
  await title.fill('日本語 Название')
  expect(await composingKey(title, 'Enter')).toBe(false)
  expect(await composingKey(title, 'Escape')).toBe(false)
  await expect(title).toBeVisible()
  await expect(title).toHaveValue('日本語 Название')
  await title.press('Enter')
  await expect(title).toBeHidden()
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Исходный код LikeC4' })).toHaveValue(
    /web = component '日本語 Название'/,
  )
})

test('connected creation ignores composing Enter/Escape and commits one ordinary Enter', async ({ page }) => {
  const code = page.getByRole('button', { name: 'Код', exact: true })
  await code.click()
  const source = page.getByRole('textbox', { name: 'Исходный код LikeC4' })
  const before = await source.inputValue()
  await code.click()
  const handle = page.locator('.likec4-authoring-handle.source[data-nodeid="shop.web"]').first()
  await expect(handle).toBeVisible()
  const box = await handle.boundingBox()
  if (!box) throw new Error('Connection handle has no visible geometry')
  const drop = await emptyCanvasPoint(page)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(drop.x, drop.y, { steps: 12 })
  await page.mouse.up()
  const menu = page.getByRole('region', { name: 'Создать элемент на холсте' })
  await expect(menu).toBeVisible()
  await menu.getByRole('button', { name: 'Компонент', exact: true }).click()
  const title = menu.getByRole('textbox', { name: 'Название нового элемента' })
  await title.fill('日本語 Связанный элемент')
  expect(await composingKey(title, 'Enter')).toBe(false)
  expect(await composingKey(title, 'Escape')).toBe(false)
  await expect(title).toHaveValue('日本語 Связанный элемент')
  await expect(menu).toBeVisible()
  await title.press('Enter')
  await expect(menu).toBeHidden()
  await code.click()
  await expect(source).toHaveValue(/component component '日本語 Связанный элемент'/)
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect(source).toHaveValue(before)
})

test('removal is native modal, contains Tab and Shift+Tab, and restores opener after Escape', async ({ page }) => {
  await openPanel(page, 'Структура')
  const opener = page.locator('button[data-element-id="shop.web"]')
  await opener.focus()
  await opener.press('Delete')
  const dialog = page.getByRole('dialog', { name: 'Удалить элемент?' })
  const cancel = dialog.getByRole('button', { name: 'Отмена', exact: true })
  const remove = dialog.getByRole('button', { name: 'Удалить', exact: true })
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true)
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(remove).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByText('Исходный файл и строка').last()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})

test('quick menu roves, exits Tab predictably, restores canvas on Escape and preserves outside focus', async ({ page }) => {
  const open = async (): Promise<void> => {
    const point = await emptyCanvasPoint(page)
    await page.mouse.click(point.x, point.y, { button: 'right' })
  }
  const menu = page.getByRole('menu', { name: 'Быстрое создание на холсте' })
  await open()
  await expect(menu.getByRole('menuitem', { name: 'Создать: Актор' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(menu.getByRole('menuitem', { name: 'Отмена', exact: true })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(menu.getByRole('menuitem', { name: 'Создать: Актор' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(menu).toBeHidden()
  expect(await page.evaluate(() => document.activeElement?.closest('[role="menu"]') === null)).toBe(true)
  const nextControl = await page.evaluate(() => document.activeElement?.outerHTML)
  await open()
  await page.keyboard.press('Tab')
  await expect(menu).toBeHidden()
  expect(await page.evaluate(() => document.activeElement?.outerHTML)).toBe(nextControl)
  await open()
  await page.keyboard.press('Shift+Tab')
  await expect(menu).toBeHidden()
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
  await open()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(page.getByRole('region', { name: 'Холст диаграммы' })).toBeFocused()
  await open()
  const code = page.getByText('Файл и действия', { exact: true })
  await code.click()
  await expect(menu).toBeHidden()
  await expect(code).toBeFocused()
})

test('plain creation menu exits Tab without creating or retaining a popup', async ({ page }) => {
  const point = await emptyCanvasPoint(page)
  await page.mouse.dblclick(point.x, point.y)
  const menu = page.getByRole('region', { name: 'Создать элемент на холсте' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(menu).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Название элемента на холсте' })).toBeHidden()
})
