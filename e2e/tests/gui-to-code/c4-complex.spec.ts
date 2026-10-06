import { type Locator, type Page, type TestInfo, expect, test } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { openPanel } from './panels'

type ElementKindLabel = 'Актор' | 'Система' | 'Контейнер' | 'Компонент'
type Rect = { id: string; x: number; y: number; width: number; height: number }

const technologies = [
  ['PostgreSQL', 'tech:postgresql'],
  ['Redis', 'tech:redis'],
  ['Kafka', 'tech:kafka'],
  ['Node.js', 'tech:nodejs'],
  ['React', 'tech:react'],
  ['Docker', 'tech:docker'],
] as const

const reliability = new WeakMap<Page, { errors: string[]; assets: string[] }>()

const node = (page: Page, id: string): Locator => page.locator(`.react-flow__node[data-id="${id}"]`)
const source = (page: Page): Locator => page.getByLabel('Исходный код LikeC4')
const saved = (page: Page): Promise<void> =>
  expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
const position = (element: Locator): Promise<string> =>
  element.evaluate(element => element instanceof HTMLElement ? element.style.transform : '')

async function closePanel(page: Page, name: 'Структура' | 'Инспектор' | 'Код'): Promise<void> {
  const toggle = page.getByRole('button', { name, exact: true })
  if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click()
}

async function nameCreatedElement(page: Page, title: string): Promise<string> {
  const input = page.getByRole('textbox', { name: 'Название элемента на холсте' })
  await expect(input).toBeFocused()
  const label = await page.locator('.inline-title-editor').getAttribute('aria-label')
  const id = label?.replace('Изменить название элемента ', '')
  if (!id || id === label) throw new Error('Created element must expose its exact model identity')
  await input.fill(title)
  await input.press('Enter')
  await expect(input).toBeHidden()
  await expect(node(page, id)).toContainText(title)
  await saved(page)
  return id
}

async function startSystem(page: Page, title = 'Сервис заказов'): Promise<{ system: string; context: string }> {
  await page.getByRole('button', { name: 'Добавить первый элемент: Система', exact: true }).click()
  const system = await nameCreatedElement(page, title)
  const context = await page.getByLabel('Текущий вид').inputValue()
  expect(system).not.toContain('.')
  expect(context).not.toBe('index')
  await expect(page.getByLabel('Текущий вид').locator('option:checked')).toContainText('C1')
  return { system, context }
}

/** Every creation requests the canvas center again, exercising collision avoidance rather than hand spacing. */
async function createElement(page: Page, kind: ElementKindLabel, title: string): Promise<string> {
  await closePanel(page, 'Структура')
  await closePanel(page, 'Инспектор')
  await closePanel(page, 'Код')
  await page.getByRole('button', { name: `Создать: ${kind}`, exact: true }).click()
  await page.getByRole('region', { name: 'Холст диаграммы' }).press('Enter')
  return nameCreatedElement(page, title)
}

async function selectElement(page: Page, id: string): Promise<void> {
  await openPanel(page, 'Структура')
  await page.locator(`.structure-item[data-element-id="${id}"]`).click()
}

async function createDetail(
  page: Page,
  scope: string,
  id: string,
  title: string,
  level: 'root' | 'selected' = 'selected',
): Promise<void> {
  await selectElement(page, scope)
  await page.getByRole('button', { name: 'Создать вид', exact: true }).click()
  const form = page.getByRole('form', { name: 'Создание статического вида' })
  await form.getByLabel('Область нового вида').selectOption(level)
  await form.getByLabel('Название нового вида').fill(title)
  await form.getByText('Подробности', { exact: true }).click()
  await form.getByLabel('ID нового вида').fill(id)
  await form.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(form).toBeHidden()
  await expect(page.getByLabel('Текущий вид')).toHaveValue(id)
  await expect(source(page)).toHaveValue(
    level === 'selected'
      ? new RegExp(`view ${id} of ${scope.replaceAll('.', '\\.')}`)
      : new RegExp(`view ${id} \\{`),
  )
  await saved(page)
}

async function connect(page: Page, from: string, to: string): Promise<void> {
  await closePanel(page, 'Структура')
  await closePanel(page, 'Инспектор')
  const before = await page.locator('.react-flow__edge').count()
  await page.getByRole('button', { name: 'Связать элементы', exact: true }).click()
  await page.getByLabel('Исходный элемент связи').selectOption(from)
  await page.getByLabel('Целевой элемент связи').selectOption(to)
  await page.getByRole('button', { name: 'Создать связь', exact: true }).click()
  await expect(page.getByLabel('Исходный элемент связи')).toBeHidden()
  await expect(page.locator('.react-flow__edge')).toHaveCount(before + 1)
  await saved(page)
}

async function readRectangles(page: Page): Promise<Rect[]> {
  return page.locator('.react-flow__node').evaluateAll(elements =>
    elements.map(element => {
      const rect = element.getBoundingClientRect()
      return {
        id: element.getAttribute('data-id') ?? '',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }
    }).filter(rect => rect.width > 0 && rect.height > 0)
  )
}

function overlaps(rectangles: readonly Rect[]): string[] {
  const result: string[] = []
  for (const [index, left] of rectangles.entries()) {
    for (const right of rectangles.slice(index + 1)) {
      // Compound containment is valid; the defect is intersection between unrelated siblings/branches.
      if (left.id.startsWith(`${right.id}.`) || right.id.startsWith(`${left.id}.`)) continue
      const width = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)
      const height = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y)
      if (width > 1 && height > 1) result.push(`${left.id} × ${right.id}`)
    }
  }
  return result
}

async function expectNoOverlap(page: Page): Promise<void> {
  await expect.poll(async () => overlaps(await readRectangles(page)), {
    message: 'Native rendered nodes must not overlap outside valid ancestor containment',
  }).toEqual([])
}

async function zipRoundTrip(page: Page, info: TestInfo, filename: string): Promise<void> {
  await saved(page)
  const fileMenu = page.locator('.file-menu')
  // The file actions menu remains a native details disclosure.
  const summary = page.getByText('Файл и действия', { exact: true })
  if (!await page.getByRole('button', { name: 'Экспортировать ZIP', exact: true }).isVisible()) await summary.click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспортировать ZIP', exact: true }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(/\.zip$/)
  const archive = info.outputPath(filename)
  await download.saveAs(archive)
  await info.attach(filename, { path: archive, contentType: 'application/zip' })
  // Replace with a visibly empty project first, so import must restore real content.
  await page.getByRole('button', { name: 'Новый пустой проект', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await saved(page)
  await page.getByLabel('Импортировать архив рабочего пространства').setInputFiles(archive)
  await saved(page)
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  if (await fileMenu.count() && await fileMenu.getAttribute('open') !== null) await summary.click()
}

async function exportedLayout(page: Page): Promise<string> {
  const extra = page.getByText('Дополнительно', { exact: true })
  const open = await page.getByLabel('Режим раскладки').isVisible()
  if (!open) await extra.click()
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспортировать раскладку', exact: true }).click()
  const file = await (await event).path()
  if (!file) throw new Error('Standard manual-layout export must succeed')
  const contents = await readFile(file, 'utf8')
  if (!open) await extra.click()
  return contents
}

test.beforeEach(async ({ page }) => {
  const observed: { errors: string[]; assets: string[] } = { errors: [], assets: [] }
  reliability.set(page, observed)
  page.on('pageerror', error => observed.errors.push(error.message))
  page.on('response', response => {
    if (
      ['script', 'stylesheet', 'image', 'font'].includes(response.request().resourceType()) && response.status() >= 400
    ) {
      observed.assets.push(`${response.status()} ${response.url()}`)
    }
  })
  page.on('requestfailed', request => {
    if (['script', 'stylesheet', 'image', 'font'].includes(request.resourceType())) {
      observed.assets.push(`${request.failure()?.errorText ?? 'failed'} ${request.url()}`)
    }
  })
  await page.setViewportSize({ width: 1600, height: 1100 })
  page.on('dialog', dialog => dialog.accept())
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()
  await page.getByText('Файл и действия', { exact: true }).click()
  await page.getByRole('button', { name: 'Новый пустой проект', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Отменить последнее изменение' })).toBeDisabled()
  await saved(page)
  await page.getByText('Файл и действия', { exact: true }).click()
})

test.afterEach(async ({ page }, info) => {
  const observed = reliability.get(page)
  await info.attach('browser-reliability.json', {
    body: JSON.stringify(observed, null, 2),
    contentType: 'application/json',
  })
  expect(observed?.errors, 'No uncaught browser errors').toEqual([])
  expect(observed?.assets, 'No failed native application assets').toEqual([])
  await expect(page.locator('.save-status')).not.toHaveAttribute('data-status', 'invalid')
  await expect(page.locator('.canvas-command-error')).toHaveCount(0)
})

test('authors C1, six C2 containers and two C3 views entirely through desktop controls', async ({ page }, info) => {
  // Eighteen separately compiled UI mutations plus view navigation and reload need a bounded journey budget.
  test.setTimeout(120_000)
  const { system } = await startSystem(page)
  const customer = await createElement(page, 'Актор', 'Покупатель')
  const payments = await createElement(page, 'Система', 'Внешняя платёжная система')
  await connect(page, customer, system)
  await connect(page, system, payments)
  await expect(page.locator('.react-flow__node')).toHaveCount(3)
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await createDetail(page, system, 'c1_context', 'Контекст сервиса заказов', 'root')
  await expect(page.getByLabel('Текущий вид').locator('option:checked')).toContainText('C1')
  await expect(page.locator('.react-flow__node')).toHaveCount(3)
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)

  await createDetail(page, system, 'c2_service', 'Контейнеры сервиса заказов')
  const containers: string[] = []
  for (const title of ['Веб-клиент', 'API заказов', 'Обработчик', 'База заказов', 'Кэш', 'Очередь событий']) {
    const id = await createElement(page, 'Контейнер', title)
    expect(id.split('.').slice(0, -1).join('.')).toBe(system)
    containers.push(id)
  }
  const [web, api, worker, database, cache, queue] = containers
  if (!web || !api || !worker || !database || !cache || !queue) throw new Error('Six containers must exist')
  for (
    const [from, to] of [
      [web, api],
      [api, database],
      [api, cache],
      [api, queue],
      [queue, worker],
      [worker, database],
      [worker, cache],
    ]
  ) await connect(page, from!, to!)
  await expectNoOverlap(page)
  await page.screenshot({ path: info.outputPath('c2-containers.png') })
  await page.getByText('Дополнительно', { exact: true }).click()
  await page.getByLabel('Режим раскладки').selectOption('auto')
  await saved(page)
  await expect(page.getByLabel('Режим раскладки')).toHaveValue('auto')
  await expectNoOverlap(page)
  await page.getByText('Дополнительно', { exact: true }).click()
  await page.screenshot({ path: info.outputPath('c2-containers-auto.png') })

  for (
    const [scope, view, titles] of [
      [api, 'c3_api', ['HTTP-контроллер', 'Сервис заказов', 'Репозиторий']],
      [worker, 'c3_worker', ['Подписчик', 'Планировщик', 'Отправка уведомлений']],
    ] as const
  ) {
    await page.getByLabel('Текущий вид').selectOption('c2_service')
    await createDetail(page, scope, view, `Компоненты ${scope === api ? 'API' : 'обработчика'}`)
    const components: string[] = []
    for (const title of titles) {
      const id = await createElement(page, 'Компонент', title)
      expect(id.split('.').slice(0, -1).join('.')).toBe(scope)
      components.push(id)
    }
    await connect(page, components[0]!, components[1]!)
    await connect(page, components[1]!, components[2]!)
    await expect(page.getByLabel('Текущий вид').locator('option:checked')).toContainText('C3')
    await expectNoOverlap(page)
    await page.getByRole('button', { name: 'Назад к родителю', exact: true }).click()
    await expect(page.getByLabel('Текущий вид')).toHaveValue('c2_service')
    await selectElement(page, scope)
    await page.getByRole('button', { name: 'Открыть детализацию', exact: true }).click()
    await expect(page.getByLabel('Текущий вид')).toHaveValue(view)
    for (const id of components) await expect(node(page, id)).toBeVisible()
  }
  const authored = await source(page).inputValue()
  expect(authored.match(/->/g)).toHaveLength(13)
  const modelPath = info.outputPath('complex-c4-model.c4')
  await writeFile(modelPath, authored)
  await info.attach('complex-c4-model.c4', { path: modelPath, contentType: 'text/plain' })
  await page.getByLabel('Текущий вид').selectOption('c1_context')
  await expect(node(page, customer)).toBeVisible()
  await expect(node(page, payments)).toBeVisible()
  await expect(source(page)).toHaveValue(authored)
  await page.getByLabel('Текущий вид').selectOption('c3_api')
  await saved(page)
  await page.reload()
  await expect(page.getByLabel('Текущий вид')).toHaveValue('c3_api')
  await expect(source(page)).toHaveValue(authored)
  await page.getByLabel('Текущий вид').selectOption('c3_worker')
  await expect(page.locator(`.react-flow__node[data-id^="${worker}."]`)).toHaveCount(3)
})

test('technology catalogue renders native logos and preserves clear/custom edits through reload and ZIP', async (
  { page },
  info,
) => {
  // Six authored containers, eight property transactions and two durable restorations.
  test.setTimeout(120_000)
  const { system } = await startSystem(page)
  await createDetail(page, system, 'c2_technologies', 'Технологии сервиса')
  const ids: string[] = []
  for (const [label, icon] of technologies) {
    const id = await createElement(page, 'Контейнер', `Узел ${label}`)
    ids.push(id)
    await selectElement(page, id)
    await openPanel(page, 'Инспектор')
    const technology = page.getByRole('combobox', { name: 'Технология', exact: true })
    await technology.click()
    await expect(page.getByRole('listbox', { name: 'Технология', exact: true }).getByRole('option')).toHaveCount(6)
    await technology.fill(label.slice(0, 3).toLowerCase())
    await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible()
    await expect(page.getByRole('listbox', { name: 'Технология', exact: true }).getByRole('option')).toHaveCount(2)
    if (label === 'PostgreSQL') {
      await technology.press('ArrowDown')
      await technology.press('Enter')
    } else {
      await page.getByRole('option', { name: label, exact: true }).click()
    }
    await expect(technology).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('button', { name: 'Сохранить свойства', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Сохранить свойства', exact: true }).click()
    await expect(node(page, id).locator(`[data-technology-icon="${icon}"]`)).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Технология', exact: true })).toHaveValue(label)
    await saved(page)
  }
  const first = ids[0]!
  await selectElement(page, first)
  await openPanel(page, 'Инспектор')
  await page.getByRole('button', { name: 'Очистить технологию', exact: true }).click()
  await page.getByRole('button', { name: 'Сохранить свойства', exact: true }).click()
  await expect(node(page, first).locator('[data-technology-icon]')).toHaveCount(0)
  await saved(page)
  await page.reload()
  await expect(node(page, first).locator('[data-technology-icon]')).toHaveCount(0)
  await selectElement(page, first)
  await openPanel(page, 'Инспектор')
  await expect(page.getByRole('combobox', { name: 'Технология', exact: true })).toHaveValue('')
  await page.getByRole('combobox', { name: 'Технология', exact: true }).fill('Внутренняя платформа')
  await page.getByRole('button', { name: 'Сохранить свойства', exact: true }).click()
  await expect(node(page, first)).toContainText('Внутренняя платформа')
  await expect(node(page, first).locator('[data-technology-icon]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Показать варианты: технология', exact: true }).click()
  await page.getByRole('option', { name: 'PostgreSQL', exact: true }).click()
  await page.getByRole('button', { name: 'Сохранить свойства', exact: true }).click()
  await saved(page)
  const custom = await createElement(page, 'Контейнер', 'Особая инфраструктура')
  await selectElement(page, custom)
  await openPanel(page, 'Инспектор')
  await page.getByRole('combobox', { name: 'Технология', exact: true }).fill('Собственная технология')
  await page.getByRole('button', { name: 'Сохранить свойства', exact: true }).click()
  await expect(node(page, custom)).toContainText('Собственная технология')
  await expect(node(page, custom).locator('[data-technology-icon]')).toHaveCount(0)
  await saved(page)
  const authored = await source(page).inputValue()
  for (const [label, icon] of technologies) {
    expect(authored).toContain(`technology '${label}'`)
    expect(authored).toContain(`icon ${icon}`)
  }
  await closePanel(page, 'Инспектор')
  await page.reload()
  await expect(source(page)).toHaveValue(authored)
  for (const [index, [, icon]] of technologies.entries()) {
    await expect(node(page, ids[index]!).locator(`[data-technology-icon="${icon}"]`)).toBeVisible()
  }
  await expect(node(page, custom)).toContainText('Собственная технология')
  await expect(node(page, custom).locator('[data-technology-icon]')).toHaveCount(0)
  await zipRoundTrip(page, info, 'technology-workspace.zip')
  await expect(source(page)).toHaveValue(authored)
  await expect(page.getByLabel('Текущий вид')).toHaveValue('c2_technologies')
  for (const [index, [, icon]] of technologies.entries()) {
    await expect(node(page, ids[index]!).locator(`[data-technology-icon="${icon}"]`)).toBeVisible()
  }
  await page.reload()
  await expect(source(page)).toHaveValue(authored)
  await expect(node(page, first).locator('[data-technology-icon="tech:postgresql"]')).toBeVisible()
  await expect(node(page, custom)).toContainText('Собственная технология')
  await expect(node(page, custom).locator('[data-technology-icon]')).toHaveCount(0)
})

test(
  'layers preserve source while same-point placement and automatic layout retain exact history and ZIP state',
  async (
    { page },
    info,
  ) => {
    // Includes native pointer and keyboard movement, layer controls, history, reload, and ZIP restoration.
    test.setTimeout(120_000)
    const { system } = await startSystem(page)
    await createDetail(page, system, 'c2_layers', 'Слои и раскладка')
    const ids: string[] = []
    for (const title of ['API', 'База данных', 'Очередь', 'Обработчик', 'Кэш', 'Клиент']) {
      ids.push(await createElement(page, 'Контейнер', title))
      await expectNoOverlap(page)
    }
    const api = ids[0]!
    await connect(page, api, ids[1]!)
    await connect(page, ids[2]!, ids[3]!)
    // Select the actual SVG path with trusted pointer input, then give its label a visible title through the inspector.
    const edgePoint = await page.locator('.react-flow__edge').first().locator('.react-flow__edge-interaction').first()
      .evaluate(element => {
        if (!(element instanceof SVGPathElement)) throw new Error('Relation path must be a native SVG path')
        const point = element.getPointAtLength(element.getTotalLength() / 2)
        const transform = element.getScreenCTM()
        if (!transform) throw new Error('Relation path must have a screen transform')
        const screen = point.matrixTransform(transform)
        return { x: screen.x, y: screen.y }
      })
    await page.mouse.click(edgePoint.x, edgePoint.y)
    await openPanel(page, 'Инспектор')
    await page.getByRole('textbox', { name: 'Название: связь', exact: true }).fill('Запрос к базе')
    await page.locator('.relation-inspector').getByRole('button', { name: 'Сохранить', exact: true }).click()
    await saved(page)
    await closePanel(page, 'Инспектор')
    const authored = await source(page).inputValue()
    const manualBeforeLock = await exportedLayout(page)
    await openPanel(page, 'Структура')
    await page.getByRole('button', { name: 'Свернуть «Сервис заказов»', exact: true }).click()
    await expect(page.locator(`.structure-item[data-element-id="${api}"]`)).toHaveCount(0)
    await expect(node(page, api)).toBeVisible()
    await page.getByRole('button', { name: 'Развернуть «Сервис заказов»', exact: true }).click()
    await expect(page.locator(`.structure-item[data-element-id="${api}"]`)).toBeVisible()
    await page.getByRole('button', { name: 'Скрыть «Сервис заказов» на холсте', exact: true }).click()
    for (const id of ids) await expect(node(page, id)).toBeHidden()
    await expect(page.locator('.react-flow__edge')).toHaveCount(0)
    await expect(source(page)).toHaveValue(authored)
    await page.getByRole('button', { name: 'Показать «Сервис заказов» на холсте', exact: true }).click()
    for (const id of ids) await expect(node(page, id)).toBeVisible()
    await expect(page.locator('.react-flow__edge')).toHaveCount(2)
    await page.getByRole('button', { name: 'Заблокировать «Сервис заказов»', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Разблокировать «API»', exact: true })).toBeDisabled()
    await selectElement(page, api)
    await openPanel(page, 'Инспектор')
    await expect(page.getByRole('textbox', { name: 'Название', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Сохранить свойства', exact: true })).toBeDisabled()
    await closePanel(page, 'Инспектор')
    await page.getByRole('button', { name: 'Показать всю диаграмму', exact: true }).click()
    const locked = await position(node(page, api))
    await node(page, api).focus()
    await page.keyboard.press('Shift+ArrowRight')
    expect(await position(node(page, api))).toBe(locked)
    const box = await node(page, api).boundingBox()
    if (!box) throw new Error('Locked container must remain visible')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 8 })
    await page.mouse.up()
    expect(await position(node(page, api))).toBe(locked)
    const edgeLabel = page.locator('.likec4-edge-label-container').filter({ hasText: 'Запрос к базе' })
    await expect(edgeLabel).toBeVisible()
    const labelPosition = await position(edgeLabel)
    const labelBox = await edgeLabel.boundingBox()
    if (!labelBox) throw new Error('Locked incident relation label must stay visible')
    await page.mouse.move(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(labelBox.x + labelBox.width / 2 + 50, labelBox.y + labelBox.height / 2 + 30, { steps: 8 })
    await page.mouse.up()
    expect(await position(edgeLabel)).toBe(labelPosition)
    expect(await exportedLayout(page)).toBe(manualBeforeLock)
    await expect(source(page)).toHaveValue(authored)
    await openPanel(page, 'Структура')
    await page.getByRole('button', { name: 'Показать и разблокировать всё', exact: true }).click()
    await selectElement(page, api)
    await openPanel(page, 'Инспектор')
    await expect(page.getByRole('textbox', { name: 'Название', exact: true })).toBeEnabled()
    await closePanel(page, 'Инспектор')
    await node(page, api).focus()
    await page.keyboard.press('Shift+ArrowRight')
    await saved(page)
    const manual = await position(node(page, api))
    expect(manual).not.toBe(locked)
    const extra = page.getByText('Дополнительно', { exact: true })
    await extra.click()
    await expect(page.getByLabel('Режим раскладки')).toHaveValue('manual')
    await page.getByLabel('Режим раскладки').selectOption('auto')
    await saved(page)
    await expect(page.getByLabel('Режим раскладки')).toHaveValue('auto')
    const automatic = await position(node(page, api))
    expect(automatic).not.toBe(manual)
    await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
    await expect(page.getByLabel('Режим раскладки')).toHaveValue('manual')
    await expect.poll(() => position(node(page, api))).toBe(manual)
    await page.getByRole('button', { name: 'Повторить отменённое изменение' }).click()
    await expect(page.getByLabel('Режим раскладки')).toHaveValue('auto')
    await expect.poll(() => position(node(page, api))).toBe(automatic)
    await expect(source(page)).toHaveValue(authored)
    await saved(page)
    await page.reload()
    await expect(page.getByLabel('Текущий вид')).toHaveValue('c2_layers')
    await expect.poll(() => position(node(page, api))).toBe(automatic)
    await extra.click()
    await expect(page.getByLabel('Режим раскладки')).toHaveValue('auto')
    await zipRoundTrip(page, info, 'automatic-layout-workspace.zip')
    await expect(source(page)).toHaveValue(authored)
    await expect.poll(() => position(node(page, api))).toBe(automatic)
    await expectNoOverlap(page)
    await page.reload()
    await expect.poll(() => position(node(page, api))).toBe(automatic)
  },
)

test('a locked relation target protects its dependency when deleting an unlocked source', async ({ page }, info) => {
  const { system: from } = await startSystem(page, 'Сервис А')
  const to = await createElement(page, 'Система', 'Сервис Б')
  await connect(page, from, to)
  const authored = await source(page).inputValue()
  await openPanel(page, 'Структура')
  await page.getByRole('button', { name: 'Заблокировать «Сервис Б»', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Разблокировать «Сервис Б»', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await selectElement(page, from)
  const unlockedSource = page.locator(`.structure-item[data-element-id="${from}"]`)
  await expect(unlockedSource.locator('..')).toHaveAttribute('data-locked', 'false')
  await unlockedSource.press('Delete')
  const dialog = page.getByRole('dialog', { name: 'Удалить элемент?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.dependency-list')).toContainText('Сервис А')
  await expect(dialog.locator('.dependency-list')).toContainText('Сервис Б')
  await dialog.getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Элемент заблокирован в слоях.')
  await expect(source(page)).toHaveValue(authored)
  await expect(node(page, from)).toBeVisible()
  await expect(node(page, to)).toBeVisible()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.screenshot({ path: info.outputPath('locked-target-rejects-source-removal.png') })
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click()
  await page.getByRole('button', { name: 'Закрыть сообщение об ошибке', exact: true }).click()
  await openPanel(page, 'Структура')
  await page.getByRole('button', { name: 'Разблокировать «Сервис Б»', exact: true }).click()
  await selectElement(page, from)
  await unlockedSource.press('Delete')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Удалить', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(node(page, from)).toHaveCount(0)
  await expect(node(page, to)).toBeVisible()
  await expect(page.locator('.react-flow__edge')).toHaveCount(0)
  await expect(page.locator(`.structure-item[data-element-id="${from}"]`)).toHaveCount(0)
  await expect(source(page)).not.toHaveValue(authored)
  expect((await source(page).inputValue()).match(/->/g) ?? []).toHaveLength(0)
  await saved(page)
})

test('authors over fifty elements across three C4 levels and records desktop layout and durability timings', async (
  { page },
  info,
) => {
  // 57 UI-created elements, eight scoped views and their compile/save cycles are intentionally measured together.
  test.setTimeout(240_000)
  const timings: { action: string; milliseconds: number }[] = []
  const started = Date.now()
  const { system, context } = await startSystem(page, 'Большой сервис')
  await createDetail(page, system, 'c2_scale', 'Контейнеры большого сервиса')
  const containers: string[] = []
  for (let index = 0; index < 8; index++) {
    const before = Date.now()
    containers.push(await createElement(page, 'Контейнер', `Контейнер ${index + 1}`))
    timings.push({ action: `create container ${index + 1} and save`, milliseconds: Date.now() - before })
  }
  for (const [index, container] of containers.entries()) {
    await page.getByLabel('Текущий вид').selectOption('c2_scale')
    await createDetail(page, container, `c3_scale_${index}`, `Компоненты контейнера ${index + 1}`)
    for (let component = 0; component < 6; component++) {
      const before = Date.now()
      const id = await createElement(page, 'Компонент', `Компонент ${index + 1}.${component + 1}`)
      expect(id.split('.').slice(0, -1).join('.')).toBe(container)
      timings.push({
        action: `create component ${index + 1}.${component + 1} and save`,
        milliseconds: Date.now() - before,
      })
    }
    await expect(page.locator(`.react-flow__node[data-id^="${container}."]`)).toHaveCount(6)
    await page.getByText('Дополнительно', { exact: true }).click()
    const before = Date.now()
    await page.getByLabel('Режим раскладки').selectOption('auto')
    await saved(page)
    timings.push({ action: `auto layout container ${index + 1} and save`, milliseconds: Date.now() - before })
    await expectNoOverlap(page)
    await page.getByText('Дополнительно', { exact: true }).click()
  }
  const authored = await source(page).inputValue()
  await openPanel(page, 'Структура')
  await expect(page.locator('.structure-item')).toHaveCount(57)
  const modelPath = info.outputPath('scale-c4-model.c4')
  await writeFile(modelPath, authored)
  await info.attach('scale-c4-model.c4', { path: modelPath, contentType: 'text/plain' })
  await closePanel(page, 'Структура')
  for (const view of [context, 'c2_scale', 'c3_scale_0', 'c3_scale_7']) {
    const before = Date.now()
    await page.getByLabel('Текущий вид').selectOption(view)
    await expect(page.locator('.react-flow__node').first()).toBeVisible()
    timings.push({ action: `navigate ${view}`, milliseconds: Date.now() - before })
    await expect(source(page)).toHaveValue(authored)
  }
  await saved(page)
  await info.attach('desktop-scale-before-reload-timings.json', {
    body: JSON.stringify(timings, null, 2),
    contentType: 'application/json',
  })
  const reloadStarted = Date.now()
  await page.reload()
  await expect(page.getByLabel('Текущий вид')).toHaveValue('c3_scale_7')
  await expect(page.locator(`.react-flow__node[data-id^="${containers[7]}."]`)).toHaveCount(6)
  await expect(source(page)).toHaveValue(authored)
  timings.push({ action: 'reload and restore', milliseconds: Date.now() - reloadStarted })
  timings.push({ action: 'complete 57-element journey', milliseconds: Date.now() - started })
  await info.attach('desktop-scale-timings.json', {
    body: JSON.stringify(timings, null, 2),
    contentType: 'application/json',
  })
  await page.screenshot({ path: info.outputPath('c3-scale-restored.png') })
})
