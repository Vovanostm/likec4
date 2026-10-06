import { type Locator, type Page, type TestInfo, expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { openPanel } from './panels'

type Point = { x: number; y: number }
type Box = Point & { width: number; height: number }
type ElementIdentity = { id: string; title: string }
type Relationship = { source: ElementIdentity; target: ElementIdentity; title: string }
type NodeGeometry = Box & { id: string; transform: string }
type RouteGeometry = {
  id: string
  source: string
  target: string
  d: string
  direction: string
  markerStart: string | null
  markerEnd: string | null
  scale: number
  points: Point[]
  flowPoints: Point[]
}
type LabelGeometry = Box & { edgeId: string; text: string }
type Geometry = { nodes: NodeGeometry[]; routes: RouteGeometry[]; labels: LabelGeometry[] }

const saved = (page: Page): Promise<void> =>
  expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
const source = (page: Page): Locator => page.getByLabel('Исходный код LikeC4')
const node = (page: Page, id: string): Locator => page.locator(`.react-flow__node[data-id="${id}"]`)
const errors = new WeakMap<Page, string[]>()

async function closePanels(page: Page): Promise<void> {
  for (const name of ['Структура', 'Инспектор', 'Код']) {
    const toggle = page.getByRole('button', { name, exact: true })
    if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click()
  }
}

async function nameElement(page: Page, title: string): Promise<ElementIdentity> {
  const input = page.getByRole('textbox', { name: 'Название элемента на холсте' })
  await expect(input).toBeFocused()
  const label = await page.locator('.inline-title-editor').getAttribute('aria-label')
  const id = label?.replace('Изменить название элемента ', '')
  if (!id || id === label) throw new Error('Native inline creation must expose the created element identity')
  await input.fill(title)
  await input.press('Enter')
  await expect(input).toBeHidden()
  await expect(node(page, id)).toContainText(title)
  await saved(page)
  return { id, title }
}

async function createContainer(
  page: Page,
  title: string,
  kind: 'Контейнер' | 'Актор' | 'Система' | 'Компонент' = 'Контейнер',
): Promise<ElementIdentity> {
  await closePanels(page)
  await page.getByRole('button', { name: `Создать: ${kind}`, exact: true }).click()
  // Repeating this gesture requests the same canvas center; placement remains renderer-owned.
  await page.getByRole('region', { name: 'Холст диаграммы' }).press('Enter')
  return nameElement(page, title)
}

async function createScopedService(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Добавить первый элемент: Система', exact: true }).click()
  const system = await nameElement(page, 'Сервис заказов')
  await openPanel(page, 'Структура')
  await page.locator(`.structure-item[data-element-id="${system.id}"]`).click()
  await page.getByRole('button', { name: 'Создать вид', exact: true }).click()
  const form = page.getByRole('form', { name: 'Создание статического вида' })
  await form.getByLabel('Область нового вида').selectOption('selected')
  await form.getByLabel('Название нового вида').fill('Читаемость связей')
  await form.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(form).toBeHidden()
  await saved(page)
  await closePanels(page)
}

function relationshipEdges(page: Page, relationship: Relationship): Locator {
  return page.locator('.react-flow__edge').filter({
    has: page.locator(`.likec4-edge-container`),
  }).and(page.getByRole('group', {
    name: new RegExp(`^Связь от ${relationship.source.title} к ${relationship.target.title}\\.`),
  }))
}

async function selectEdge(page: Page, edge: Locator): Promise<void> {
  // Fit-to-view animates after model changes. Settle the rendered transform before choosing a screen coordinate.
  let previous = ''
  await expect.poll(async () => {
    const current = await edge.evaluate(element => {
      const path = [...element.querySelectorAll<SVGPathElement>('.react-flow__edge-path')].at(-1)
      const matrix = path?.getScreenCTM()
      return JSON.stringify({
        d: path?.getAttribute('d'),
        matrix: matrix && [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
      })
    })
    const stable = current === previous
    previous = current
    return stable
  }, { message: 'Rendered connection must finish fitting before native pointer selection', intervals: [150] })
    .toBe(true)
  // Find a real, unobstructed native path point. Reading SVG/DOM does not modify graph or geometry.
  const point = await edge.evaluate(element => {
    const path = [...element.querySelectorAll<SVGPathElement>('.react-flow__edge-path')].at(-1)
    const root = element.getRootNode()
    const matrix = path?.getScreenCTM()
    if (!path || !matrix) return null
    const length = path.getTotalLength()
    const samples = Math.max(2, Math.min(4096, Math.ceil(length * Math.hypot(matrix.a, matrix.b) / 2)))
    for (let index = 0; index < samples; index++) {
      const fraction = ((Math.floor(samples / 2) + index) % samples) / samples
      const point = path.getPointAtLength(length * fraction).matrixTransform(matrix)
      const hit = root instanceof ShadowRoot || root instanceof Document
        ? root.elementFromPoint(point.x, point.y)
        : null
      if (hit?.closest('.react-flow__edge') === element) return { x: point.x, y: point.y }
    }
    return null
  })
  if (!point) throw new Error('No unobstructed native relationship path point accepts pointer selection')
  await page.mouse.click(point.x, point.y)
  await expect(edge).toHaveClass(/selected/)
  await openPanel(page, 'Инспектор')
}

async function createRelationship(page: Page, relationship: Relationship): Promise<void> {
  await closePanels(page)
  const before = (await source(page).inputValue()).match(/->/g)?.length ?? 0
  await page.getByRole('button', { name: 'Связать элементы', exact: true }).click()
  await page.getByLabel('Исходный элемент связи').selectOption(relationship.source.id)
  await page.getByLabel('Целевой элемент связи').selectOption(relationship.target.id)
  await page.getByRole('button', { name: 'Создать связь', exact: true }).click()
  await expect(page.getByLabel('Исходный элемент связи')).toBeHidden()
  await saved(page)
  expect((await source(page).inputValue()).match(/->/g)).toHaveLength(before + 1)
  if (!relationship.title) return
  const edge = relationshipEdges(page, relationship).last()
  await expect(edge).toBeVisible()
  await selectEdge(page, edge)
  // Default LikeC4 views deliberately aggregate parallel logical relations; the last alternative is the new declaration.
  const alternatives = page.locator('.relation-inspector').getByRole('button', { name: /^Связь \d+$/ })
  if (await alternatives.count()) await alternatives.last().click()
  await page.getByRole('textbox', { name: 'Название: связь', exact: true }).fill(relationship.title)
  await page.locator('.relation-inspector').getByRole('button', { name: 'Сохранить', exact: true }).click()
  await saved(page)
  await closePanels(page)
}

async function readGeometry(page: Page, relationships: readonly Relationship[]): Promise<Geometry> {
  // One synchronous native DOM read keeps nodes, SVG paths and labels in the same animation frame.
  return page.locator('.react-flow__viewport').evaluate((viewport, relationships) => {
    const root = viewport.getRootNode()
    if (!(root instanceof ShadowRoot || root instanceof Document)) throw new Error('Missing diagram DOM root')
    const nodes = [...root.querySelectorAll('.react-flow__node')].map(element => {
      const rect = element.getBoundingClientRect()
      return {
        id: element.getAttribute('data-id') ?? '',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        transform: element instanceof HTMLElement ? element.style.transform : '',
      }
    })
    const routes = [...root.querySelectorAll('.react-flow__edge')].map(element => {
      const aria = element.getAttribute('aria-label') ?? ''
      const identity = relationships.find(relationship =>
        aria.startsWith(`Связь от ${relationship.source.title} к ${relationship.target.title}.`)
      )
      const path = [...element.querySelectorAll<SVGPathElement>('.react-flow__edge-path')].at(-1)
      if (!path || !identity) throw new Error(`Rendered relationship has no native path or known endpoints: ${aria}`)
      const matrix = path.getScreenCTM()
      if (!matrix) throw new Error('Rendered path has no screen coordinate transform')
      const length = path.getTotalLength()
      const scale = Math.hypot(matrix.a, matrix.b)
      // Sample at most every two screen pixels, preserving the actual SVG curves and viewport transform.
      const samples = Math.max(2, Math.min(4096, Math.ceil(length * scale / 2)))
      const points = []
      const flowPoints = []
      for (let sample = 0; sample <= samples; sample++) {
        const point = path.getPointAtLength(length * sample / samples)
        const screen = point.matrixTransform(matrix)
        points.push({ x: screen.x, y: screen.y })
        flowPoints.push({ x: point.x, y: point.y })
      }
      return {
        id: element.getAttribute('data-id') ?? '',
        source: identity.source.id,
        target: identity.target.id,
        d: path.getAttribute('d') ?? '',
        direction: element.querySelector('[data-edge-dir]')?.getAttribute('data-edge-dir') ?? '',
        markerStart: path.getAttribute('marker-start'),
        markerEnd: path.getAttribute('marker-end'),
        scale,
        points,
        flowPoints,
      }
    })
    const labels = [...root.querySelectorAll('.likec4-edge-label-container')].map(element => {
      const rect = element.getBoundingClientRect()
      return {
        edgeId: element.querySelector('[data-edge-id]')?.getAttribute('data-edge-id') ?? '',
        text: element.textContent?.trim() ?? '',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }
    })
    return { nodes, routes, labels }
  }, relationships)
}

function inside(point: Point, box: Box, inset = 2): boolean {
  return point.x > box.x + inset && point.x < box.x + box.width - inset
    && point.y > box.y + inset && point.y < box.y + box.height - inset
}

function borderDistance(point: Point, box: Box): number {
  const within = point.x >= box.x && point.x <= box.x + box.width
    && point.y >= box.y && point.y <= box.y + box.height
  if (within) {
    return Math.min(point.x - box.x, box.x + box.width - point.x, point.y - box.y, box.y + box.height - point.y)
  }
  return Math.hypot(
    point.x - Math.max(box.x, Math.min(box.x + box.width, point.x)),
    point.y - Math.max(box.y, Math.min(box.y + box.height, point.y)),
  )
}

function intersectionArea(left: Box, right: Box): number {
  return Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
    * Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
}

function geometryFailures(geometry: Geometry): string[] {
  const failures: string[] = []
  const leaves = geometry.nodes.filter(candidate =>
    !geometry.nodes.some(node => node.id.startsWith(`${candidate.id}.`))
  )
  for (const route of geometry.routes) {
    const from = geometry.nodes.find(node => node.id === route.source)
    const to = geometry.nodes.find(node => node.id === route.target)
    if (!from || !to) {
      failures.push(`${route.id}: missing intended endpoint node`)
      continue
    }
    const reverse = route.direction === 'back'
    const start = route.points[0]!
    const end = route.points.at(-1)!
    // Native renderer permits a six-unit port margin and Graphviz arrow clearance at the border.
    const tolerance = 14 * route.scale + 1
    const sourceDistance = borderDistance(reverse ? end : start, from)
    const targetDistance = borderDistance(reverse ? start : end, to)
    if (sourceDistance > tolerance) {
      failures.push(`${route.id}: source attachment misses ${from.id} border by ${sourceDistance.toFixed(1)}px`)
    }
    if (targetDistance > tolerance) {
      failures.push(`${route.id}: target attachment misses ${to.id} border by ${targetDistance.toFixed(1)}px`)
    }
    if (!(reverse ? route.markerStart : route.markerEnd)) {
      failures.push(`${route.id}: directed target has no arrow marker`)
    }
    for (const obstacle of leaves) {
      if (
        obstacle.id === route.source || obstacle.id === route.target
        || route.source.startsWith(`${obstacle.id}.`) || route.target.startsWith(`${obstacle.id}.`)
      ) continue
      if (route.points.some(point => inside(point, obstacle))) {
        failures.push(`${route.id}: SVG line crosses unrelated leaf ${obstacle.id}`)
      }
    }
  }
  for (const [index, label] of geometry.labels.entries()) {
    if (!label.text || label.width <= 0 || label.height <= 0) {
      failures.push(`${label.edgeId}: relationship label is empty or invisible`)
    }
    const route = geometry.routes.find(route => route.id === label.edgeId)
    if (route) {
      const gap = Math.min(...route.points.map(point =>
        Math.hypot(
          Math.max(label.x - point.x, 0, point.x - label.x - label.width),
          Math.max(label.y - point.y, 0, point.y - label.y - label.height),
        )
      ))
      if (gap > 36 * route.scale + 2) failures.push(`${label.edgeId}: automatic label is detached from its line`)
    }
    for (const leaf of leaves) {
      if (intersectionArea(label, leaf) > 4) failures.push(`${label.edgeId}: label overlaps leaf ${leaf.id}`)
    }
    for (const other of geometry.labels.slice(index + 1)) {
      if (intersectionArea(label, other) > 4) failures.push(`${label.edgeId}: label overlaps label ${other.edgeId}`)
    }
  }
  return failures
}

function signature(geometry: Geometry): string {
  return JSON.stringify({
    nodes: geometry.nodes.map(({ id, transform }) => ({ id, transform })).sort((a, b) => a.id.localeCompare(b.id)),
    routes: geometry.routes.map(({ id, d, direction, markerStart, markerEnd }) => ({
      id,
      d,
      direction,
      markerStart,
      markerEnd,
    }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  })
}

async function assertReadable(
  page: Page,
  relationships: readonly Relationship[],
  info: TestInfo,
  phase: string,
): Promise<Geometry> {
  await expect.poll(async () => geometryFailures(await readGeometry(page, relationships)), {
    message:
      `${phase}: relationships must attach to their intended borders and stay clear of unrelated leaves and labels`,
  }).toEqual([])
  const geometry = await readGeometry(page, relationships)
  const artifact = info.outputPath(`${phase}-native-geometry.json`)
  await writeFile(artifact, JSON.stringify({ geometry, failures: geometryFailures(geometry) }, null, 2))
  await info.attach(`${phase}-native-geometry.json`, { path: artifact, contentType: 'application/json' })
  await page.screenshot({ path: info.outputPath(`${phase}.png`) })
  expect(geometryFailures(geometry)).toEqual([])
  return geometry
}

test.beforeEach(async ({ page }, info) => {
  const observed: string[] = []
  errors.set(page, observed)
  page.on('pageerror', error => observed.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  await page.setViewportSize({ width: 1600, height: 1100 })
  await page.goto('/')
  if (info.title.startsWith('starter fixture ')) {
    await expect(page.getByLabel('Текущий вид')).toHaveValue('index')
    await expect(node(page, 'shop.web')).toBeVisible()
    return
  }
  await page.getByText('Файл и действия', { exact: true }).click()
  await page.getByRole('button', { name: 'Новый пустой проект', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await saved(page)
  await page.getByText('Файл и действия', { exact: true }).click()
  await createScopedService(page)
})

test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'No uncaught browser errors').toEqual([])
  await expect(page.locator('.canvas-command-error')).toHaveCount(0)
})

test(
  'connected routes avoid leaf obstacles and retain border attachment after movement, creation, history and reload',
  async (
    { page },
    info,
  ) => {
    test.setTimeout(120_000)
    const elements: ElementIdentity[] = []
    for (const title of ['Клиент', 'API', 'База', 'Кэш', 'Очередь', 'Обработчик']) {
      elements.push(await createContainer(page, title))
    }
    const [client, api, database, cache, queue, worker] = elements
    if (!client || !api || !database || !cache || !queue || !worker) {
      throw new Error(
        'Six UI-authored leaves must exist',
      )
    }
    const relationships: Relationship[] = [
      { source: client, target: api, title: 'Приём заказа' },
      { source: api, target: database, title: 'Сохранение заказа' },
      { source: api, target: cache, title: 'Чтение кэша' },
      { source: api, target: queue, title: 'Публикация события' },
      { source: queue, target: worker, title: 'Доставка события' },
      { source: worker, target: database, title: 'Запись результата' },
      { source: worker, target: cache, title: 'Обновление кэша' },
    ]
    for (const relationship of relationships) await createRelationship(page, relationship)
    await expect(page.locator('.react-flow__edge')).toHaveCount(7)
    const authored = await source(page).inputValue()
    const original = await assertReadable(page, relationships, info, 'same-point-connected')

    await node(page, api.id).click()
    await node(page, api.id).focus()
    for (let step = 0; step < 3; step++) await page.keyboard.press('Shift+ArrowRight')
    await saved(page)
    await expect(source(page)).toHaveValue(authored)
    const moved = await assertReadable(page, relationships, info, 'keyboard-moved')
    expect(signature(moved)).not.toBe(signature(original))
    // Native selection can focus the inner node surface. It must use the same durable movement owner.
    const content = node(page, api.id).locator('.likec4-element-node')
    await content.focus()
    await page.keyboard.press('Shift+ArrowRight')
    await saved(page)
    await expect(source(page)).toHaveValue(authored)
    const contentMoved = await assertReadable(page, relationships, info, 'inner-node-moved')
    expect(signature(contentMoved)).not.toBe(signature(moved))
    await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
    await saved(page)
    expect(signature(await assertReadable(page, relationships, info, 'inner-node-undo'))).toBe(signature(moved))
    await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
    await saved(page)
    await assertReadable(page, relationships, info, 'movement-undo')
    await page.getByRole('button', { name: 'Повторить отменённое изменение' }).click()
    await saved(page)
    const redone = await assertReadable(page, relationships, info, 'movement-redo')
    expect(signature(redone)).toBe(signature(moved))

    await page.getByRole('button', { name: 'Показать всю диаграмму', exact: true }).click()
    const bounds = await node(page, worker.id).boundingBox()
    if (!bounds) throw new Error('Pointer-moved native leaf must be visible')
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width / 2 + 40, bounds.y + bounds.height / 2 + 24, { steps: 8 })
    const dragged = await readGeometry(page, relationships)
    await page.mouse.up()
    await saved(page)
    await expect(source(page)).toHaveValue(authored)
    const pointerMoved = await assertReadable(page, relationships, info, 'pointer-moved')
    expect(signature(pointerMoved), 'Saving a native drag must preserve its visible curves').toBe(signature(dragged))

    const metrics = await createContainer(page, 'Метрики')
    const fresh = { source: api, target: metrics, title: 'Счётчик заказов' }
    relationships.push(fresh)
    await createRelationship(page, fresh)
    await expect(page.locator('.react-flow__edge')).toHaveCount(8)
    const beforeReload = await assertReadable(page, relationships, info, 'fresh-route')
    const completeSource = await source(page).inputValue()
    await saved(page)
    await page.reload()
    await expect(source(page)).toHaveValue(completeSource)
    await expect(page.locator('.react-flow__edge')).toHaveCount(8)
    const restored = await assertReadable(page, relationships, info, 'reloaded')
    expect(signature(restored)).toBe(signature(beforeReload))
  },
)

test('opposite directions and parallel logical links remain distinguishable with readable native labels', async (
  { page },
  info,
) => {
  test.setTimeout(90_000)
  const elements: ElementIdentity[] = []
  for (const title of ['Вход', 'Выход', 'База', 'Кэш', 'События', 'Журнал']) {
    elements.push(await createContainer(page, title))
  }
  const from = elements[0]!
  const to = elements[1]!
  const relationships: Relationship[] = [
    { source: from, target: to, title: 'Запрос заказа' },
    { source: to, target: from, title: 'Ответ заказа' },
    { source: from, target: to, title: 'Событие заказа' },
  ]
  for (const relationship of relationships) await createRelationship(page, relationship)
  const geometry = await assertReadable(page, relationships, info, 'opposite-parallel')
  const forward = geometry.routes.filter(route => route.source === from.id && route.target === to.id)
  const reverse = geometry.routes.filter(route => route.source === to.id && route.target === from.id)
  expect(forward.length).toBeGreaterThan(0)
  expect(reverse).toHaveLength(1)
  for (const route of forward) {
    const separation = Math.max(
      ...route.flowPoints.map(point =>
        Math.min(...reverse[0]!.flowPoints.map(other => Math.hypot(point.x - other.x, point.y - other.y)))
      ),
    )
    expect(separation, 'Opposite directed paths must not lie on the exact same line').toBeGreaterThan(4)
  }
  // Default static views may aggregate parallel declarations. They must still expose both exact titles through UI.
  if (forward.length === 1) {
    await selectEdge(page, relationshipEdges(page, relationships[0]!).first())
    const alternatives = page.locator('.relation-inspector').getByRole('button', { name: /^Связь \d+$/ })
    await expect(alternatives).toHaveCount(2)
    const titles: string[] = []
    for (let index = 0; index < 2; index++) {
      await alternatives.nth(index).click()
      titles.push(await page.getByRole('textbox', { name: 'Название: связь', exact: true }).inputValue())
    }
    expect(titles.sort()).toEqual(['Запрос заказа', 'Событие заказа'].sort())
    await closePanels(page)
  } else {
    for (const title of ['Запрос заказа', 'Событие заказа']) {
      await expect(page.locator('.likec4-edge-label').filter({ hasText: title })).toBeVisible()
    }
  }
  await expect(page.locator('.likec4-edge-label').filter({ hasText: 'Ответ заказа' })).toBeVisible()
  const before = signature(await readGeometry(page, relationships))
  await saved(page)
  await page.reload()
  const restored = await assertReadable(page, relationships, info, 'opposite-parallel-reloaded')
  expect(signature(restored)).toBe(before)
})

async function moveWithKeyboard(page: Page, id: string, requested: Point): Promise<void> {
  await openPanel(page, 'Структура')
  await page.locator(`.structure-item[data-element-id="${id}"]`).click()
  await closePanels(page)
  const element = node(page, id)
  for (const axis of ['x', 'y'] as const) {
    const current = await element.evaluate(element => {
      if (!(element instanceof HTMLElement)) throw new Error('Native node must expose its rendered transform')
      const transform = new DOMMatrixReadOnly(element.style.transform)
      return { x: transform.m41, y: transform.m42 }
    })
    const delta = requested[axis] - current[axis]
    const steps = Math.round(Math.abs(delta) / 20)
    if (steps > 100) throw new Error('Requested native movement exceeds this bounded desktop fixture')
    if (!steps) continue
    const direction = axis === 'x'
      ? delta > 0 ? 'ArrowRight' : 'ArrowLeft'
      : delta > 0
      ? 'ArrowDown'
      : 'ArrowUp'
    await page.getByRole('button', { name: 'Показать всю диаграмму', exact: true }).click()
    await element.focus()
    await page.keyboard.down('Shift')
    for (let step = 0; step < steps; step++) await page.keyboard.down(direction)
    await page.keyboard.up(direction)
    await page.keyboard.up('Shift')
    await saved(page)
  }
}

test(
  'starter fixture keeps Customer and nested actor/system/component routes correct after native manual placement',
  async (
    { page },
    info,
  ) => {
    test.setTimeout(120_000)
    // Recreate the user's reported model using the fresh starter and visible creation controls, never source/storage injection.
    const customer = { id: 'customer', title: 'Customer' }
    const shop = { id: 'shop', title: 'Online shop' }
    const web = { id: 'shop.web', title: 'Web application' }
    const actor = await createContainer(page, 'actor', 'Актор')
    const system = await createContainer(page, 'system', 'Система')
    const component = await createContainer(page, 'component', 'Компонент')
    expect([actor.id, system.id, component.id]).toEqual(['shop.actor', 'shop.system', 'shop.component'])
    const fresh: Relationship[] = [
      { source: actor, target: system, title: '' },
      { source: system, target: actor, title: '' },
      { source: system, target: web, title: '' },
    ]
    for (const relationship of fresh) await createRelationship(page, relationship)
    const relationships: Relationship[] = [
      { source: customer, target: shop, title: 'places orders' },
      { source: web, target: customer, title: 'shows orders' },
      ...fresh,
    ]
    const authored = await source(page).inputValue()
    expect(authored.match(/->/g)).toHaveLength(5)
    await expect(page.locator('.react-flow__node')).toHaveCount(6)
    const modelPath = info.outputPath('ui-authored-starter-fixture.c4')
    await writeFile(modelPath, authored)
    await info.attach('ui-authored-starter-fixture.c4', { path: modelPath, contentType: 'text/plain' })

    // These are the observed absolute native node coordinates from the rejected user workspace.
    // Keyboard gestures preserve renderer constraints; any adjusted final coordinates are recorded in native geometry evidence.
    const requested = [
      { id: shop.id, x: 97, y: -129 },
      { id: customer.id, x: 48, y: 392 },
      { id: actor.id, x: 730, y: 431 },
      { id: system.id, x: 253, y: 224 },
      { id: web.id, x: 139, y: -69 },
      { id: component.id, x: 882, y: -30 },
    ]
    for (const point of requested) await moveWithKeyboard(page, point.id, point)
    await page.getByRole('button', { name: 'Показать всю диаграмму', exact: true }).click()
    await expect(source(page)).toHaveValue(authored)
    const before = await assertReadable(page, relationships, info, 'starter-native-placed')
    await saved(page)
    await page.reload()
    await expect(source(page)).toHaveValue(authored)
    const after = await assertReadable(page, relationships, info, 'starter-native-reloaded')
    expect(signature(after)).toBe(signature(before))
  },
)
