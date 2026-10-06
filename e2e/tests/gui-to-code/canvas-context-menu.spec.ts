import { type Locator, type Page, expect, test } from '@playwright/test'
import { openPanel } from './panels'

async function rightClickEmptyCanvas(page: Page, fromBottom = false): Promise<void> {
  const point = await page.locator('.react-flow__pane').first().evaluate((pane, preferBottom) => {
    const rect = pane.getBoundingClientRect()
    const left = Math.max(rect.left + 24, 24)
    const right = Math.min(rect.right - 24, window.innerWidth - 24)
    const top = Math.max(rect.top + 24, 24)
    const bottom = Math.min(rect.bottom - 24, window.innerHeight - 24)
    const root = pane.getRootNode() as Node & { elementFromPoint?: (x: number, y: number) => Element | null }

    for (let y = preferBottom ? bottom : top; preferBottom ? y >= top : y <= bottom; y += preferBottom ? -24 : 24) {
      for (let x = right; x >= left; x -= 24) {
        const target = root.elementFromPoint?.(x, y)
        if (target === pane || target?.closest('.react-flow__pane') === pane) return { x, y }
      }
    }
    return null
  }, fromBottom)
  if (!point) throw new Error('No visible empty canvas point is available')
  await page.mouse.click(point.x, point.y, { button: 'right' })
}

async function expectOverlayInsidePanel(page: Page, overlay: Locator): Promise<void> {
  await expect(async () => {
    const menuBox = await overlay.boundingBox()
    const panelBox = await page.getByRole('region', { name: 'Холст диаграммы' }).boundingBox()
    if (!menuBox || !panelBox) throw new Error('Canvas menu or panel has no geometry')
    expect(menuBox.x).toBeGreaterThanOrEqual(panelBox.x)
    expect(menuBox.y).toBeGreaterThanOrEqual(panelBox.y)
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width)
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height)
  }).toPass()
}

test('right-click quick menu creates a positioned component and starts the existing relation flow', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__pane').first()).toBeVisible()

  await rightClickEmptyCanvas(page)
  const menu = page.getByRole('menu', { name: 'Быстрое создание на холсте' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Создать: Актор' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Создать: Система' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  await rightClickEmptyCanvas(page)
  await menu.getByRole('menuitem', { name: 'Создать: Компонент' }).click()
  await expect(menu).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Название элемента на холсте' })).toBeVisible()
  await page.keyboard.press('Escape')
  await openPanel(page, 'Структура')
  await expect(page.getByRole('treeitem', { name: /component shop\.component/ })).toBeVisible()

  await page.getByRole('button', { name: 'Код', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Исходный код LikeC4' })
  await expect(source).toHaveValue(/component component/)
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect(source).not.toHaveValue(/component component/)
  await page.getByRole('button', { name: 'Код', exact: true }).click()

  await rightClickEmptyCanvas(page)
  await menu.getByRole('menuitem', { name: 'Начать создание связи' }).click()
  await expect(menu).toBeHidden()
  await expect(page.getByRole('region', { name: 'Создание связи с клавиатуры' })).toBeVisible()
})

test('quick menu stays inside the canvas panel after opening and resizing, and closes on outside click', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.react-flow__pane').first()).toBeVisible()

  await rightClickEmptyCanvas(page, true)
  const menu = page.getByRole('menu', { name: 'Быстрое создание на холсте' })
  await expect(menu).toBeVisible()

  await expectOverlayInsidePanel(page, menu)
  await page.setViewportSize({ width: 900, height: 600 })
  await expectOverlayInsidePanel(page, menu)

  await page.getByRole('button', { name: 'Инспектор', exact: true }).click()
  await expect(menu).toBeHidden()
})

test('inline naming stays inside the canvas after edge creation, panel changes and viewport resize', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  const structure = page.getByRole('button', { name: 'Структура', exact: true })
  await structure.click()
  await rightClickEmptyCanvas(page, true)
  const menu = page.getByRole('menu', { name: 'Быстрое создание на холсте' })
  await menu.getByRole('menuitem', { name: 'Создать: Компонент' }).click()
  const title = page.getByRole('textbox', { name: 'Название элемента на холсте' })
  const form = page.getByRole('form', { name: 'Изменить название элемента shop.component' })
  await expect(title).toBeFocused()
  await expectOverlayInsidePanel(page, form)

  // An empty draft is retained on outside blur, so toggling the panel tests live overlay resizing.
  await title.fill('')
  await structure.click()
  await expectOverlayInsidePanel(page, form)
  await page.setViewportSize({ width: 900, height: 600 })
  await expectOverlayInsidePanel(page, form)
  await title.fill('Платёжный модуль')
  await form.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(form).toBeHidden()
  await openPanel(page, 'Структура')
  await expect(page.getByRole('treeitem', { name: /Платёжный модуль shop\.component/ })).toBeVisible()
})

async function canvasGeometry(page: Page) {
  return page.locator('.diagram').evaluate(element => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
}

async function visibleEdgePoint(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.locator('.react-flow__edge-path').first().evaluate(path => {
    const svgPath = path as SVGPathElement
    const matrix = svgPath.getScreenCTM()
    if (!matrix) return null
    const root = path.getRootNode() as Node & { elementFromPoint?: (x: number, y: number) => Element | null }
    for (let fraction = 0.2; fraction < 0.9; fraction += 0.1) {
      const local = svgPath.getPointAtLength(svgPath.getTotalLength() * fraction)
      const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix)
      if (root.elementFromPoint?.(screen.x, screen.y)?.closest('.react-flow__edge')) {
        return { x: screen.x, y: screen.y }
      }
    }
    return null
  })
  if (!point) throw new Error('No visible relationship line point')
  return point
}

test('native right-click opens object and canvas menus without editing source, bends or history', async ({ page }) => {
  await page.goto('/')
  const customer = page.locator('.react-flow__node[data-id="customer"]')
  await expect(customer).toBeVisible()
  const bounds = await customer.boundingBox()
  if (!bounds) throw new Error('Customer must have visible geometry')
  // A real drag enables and persists manual layout, where the legacy RMB bend gestures ran.
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2 + 70, bounds.y + bounds.height / 2 + 40, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByText('Ручная раскладка сохранена.', { exact: true })).toBeVisible()

  await page.locator('.likec4-edge-label-container').first().click()
  const point = await visibleEdgePoint(page)
  // Existing LMB editing still creates a bend; RMB on that bend must open the same menu.
  await page.mouse.click(point.x, point.y)
  const bend = page.locator('[data-control-point-index]').first()
  await expect(bend).toBeVisible()
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  const source = page.getByLabel('Исходный код LikeC4')
  const sourceBefore = await source.inputValue()
  const revision = await page.getByText(/Ревизия проекта:/).textContent()
  const geometry = async () => ({
    paths: await page.locator('.react-flow__edge-path').evaluateAll(paths => paths.map(path => path.getAttribute('d'))),
    nodes: await page.locator('.react-flow__node').evaluateAll(nodes => nodes.map(node => node.getAttribute('style'))),
  })
  const before = await geometry()
  const bends = await page.locator('[data-control-point-index]').count()
  const menu = page.getByRole('menu', { name: 'Действия выбранной сущности' })
  // Record whether the native browser default was suppressed after React handles each event.
  await page.evaluate(() => {
    document.addEventListener('contextmenu', event => {
      // Native listeners can drain microtasks before React's bubble handler runs.
      setTimeout(() => document.body.dataset.contextPrevented = String(event.defaultPrevented), 0)
    }, true)
  })

  for (const target of ['line', 'label', 'bend', 'title', 'compound', 'pane']) {
    if (target === 'line') {
      const screen = await visibleEdgePoint(page)
      await page.mouse.click(screen.x, screen.y, { button: 'right' })
    } else if (target === 'label') {
      await page.locator('.likec4-edge-label-container').first().click({ button: 'right' })
    } else if (target === 'bend') {
      await bend.click({ button: 'right' })
    } else if (target === 'title') {
      const title = await customer.getByText('Customer', { exact: true }).boundingBox()
      if (!title) throw new Error('Customer title must have visible geometry')
      // Titles are painted beneath the shape hit surface; use the real mouse at the visible text.
      await page.mouse.click(title.x + title.width / 2, title.y + title.height / 2, { button: 'right' })
    } else if (target === 'compound') {
      await page.locator('.react-flow__node[data-id="shop"]').getByText('Online shop', { exact: true }).click({
        button: 'right',
      })
    } else {
      await rightClickEmptyCanvas(page)
    }
    const currentMenu = target === 'pane' ? page.getByRole('menu', { name: 'Быстрое создание на холсте' }) : menu
    await expect(currentMenu, target).toBeVisible()
    await expect(page.locator('body'), target).toHaveAttribute('data-context-prevented', 'true')
    await expectOverlayInsidePanel(page, currentMenu)
    expect(await geometry(), target).toEqual(before)
    await expect(source).toHaveValue(sourceBefore)
    await expect(page.getByText(/Ревизия проекта:/)).toHaveText(revision ?? '')
    if (['line', 'label', 'bend'].includes(target)) {
      await expect(page.locator('[data-control-point-index]')).toHaveCount(bends)
    }
    await page.keyboard.press('Escape')
    await expect(currentMenu).toBeHidden()
  }
})

test('selection and object context menus leave the canvas and node positions unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const node = page.locator('.react-flow__node[data-id="customer"]')
  await expect(node).toBeVisible()
  const geometry = await canvasGeometry(page)
  const nodes = await page.locator('.react-flow__node').evaluateAll(items =>
    items.map(item => item.getAttribute('style'))
  )
  await node.click()
  expect(await canvasGeometry(page)).toEqual(geometry)
  await expect(page.getByRole('menu', { name: 'Действия выбранной сущности' })).toBeHidden()
  await expect(page.getByText('Положение', { exact: true })).toHaveCount(0)
  await node.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Действия выбранной сущности' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Изменить название' })).toBeFocused()
  await expectOverlayInsidePanel(page, menu)
  const menuBounds = await menu.boundingBox()
  expect(menuBounds).not.toBeNull()
  if (!menuBounds) throw new Error('Context menu must have geometry')
  expect(menuBounds.x).toBeGreaterThanOrEqual(geometry.x)
  expect(menuBounds.y).toBeGreaterThanOrEqual(geometry.y)
  expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(geometry.x + geometry.width)
  expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(geometry.y + geometry.height)
  expect(await canvasGeometry(page)).toEqual(geometry)
  expect(await page.locator('.react-flow__node').evaluateAll(items => items.map(item => item.getAttribute('style'))))
    .toEqual(nodes)
  await page.screenshot({ path: '../apps/gui-to-code/tasks/canvas-context-2026-10-06/context-menu.png' })
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(node).toBeFocused()
  await node.focus()
  await page.keyboard.press('Shift+F10')
  await expect(menu).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Свойства' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(menu).toBeHidden()
  await page.locator('.react-flow__edge').first().dispatchEvent('click')
  expect(await canvasGeometry(page)).toEqual(geometry)
  await expect(page.getByRole('button', { name: 'Инспектор', exact: true })).toHaveAttribute('aria-expanded', 'false')
})

test('right-click selects the clicked object and edits its title with exact history', async ({ page }) => {
  await page.goto('/')
  const customer = page.locator('.react-flow__node[data-id="customer"]')
  const app = page.locator('.react-flow__node[data-id="shop.web"]')
  await customer.click()
  await app.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Действия выбранной сущности' })
  await expect(menu).toContainText('Web application')
  await menu.getByRole('menuitem', { name: 'Изменить название' }).click()
  const title = page.getByRole('textbox', { name: 'Название элемента на холсте' })
  await expect(title).toHaveValue('Web application')
  await title.fill('Портал заказов')
  await title.press('Enter')
  await expect(title).toBeHidden()
  await openPanel(page, 'Код')
  const source = page.getByLabel('Исходный код LikeC4')
  await expect(source).toHaveValue(/Портал заказов/)
  await expect(source).toHaveValue(/Customer/)
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect(source).not.toHaveValue(/Портал заказов/)
  await page.getByRole('button', { name: 'Повторить отменённое изменение' }).click()
  await expect(source).toHaveValue(/Портал заказов/)
})

test('edge context menu offers properties and removal and closes when the workspace changes', async ({ page }) => {
  await page.goto('/')
  const edge = page.locator('.react-flow__edge').first()
  await expect(edge).toBeVisible()
  await edge.dispatchEvent('contextmenu', { clientX: 600, clientY: 400 })
  const menu = page.getByRole('menu', { name: 'Действия выбранной сущности' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Свойства' })).toBeFocused()
  await expect(menu.getByRole('menuitem', { name: 'Изменить название' })).toHaveCount(0)
  await menu.getByRole('menuitem', { name: 'Свойства' }).click()
  await expect(page.getByRole('button', { name: 'Инспектор', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: 'Инспектор', exact: true }).click()
  await edge.dispatchEvent('contextmenu', { clientX: 600, clientY: 400 })
  await expect(menu).toBeVisible()
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  await expect(menu).toBeHidden()
  const source = page.getByLabel('Исходный код LikeC4')
  const before = await source.inputValue()
  await source.fill(`${before}\n// context menu revision changed`)
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await expect(menu).toBeHidden()
})
