export const starterSource = `specification {
  element actor
  element system
  element component
}

model {
  customer = actor 'Customer'
  shop = system 'Online shop' {
    web = component 'Web application'
  }

  customer -> shop 'places orders'
  web -> customer 'shows orders'
}

views {
  view index of shop {
    include *
  }
}
`

export type EditorCommand =
  | { type: 'add-element'; id: string; kind: string; title: string }
  | { type: 'add-relation'; source: string; target: string; title: string }
  | { type: 'add-view'; id: string; of: string }

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/
const fqn = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/

function quoted(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'')}'`
}

function findBlockEnd(source: string, block: 'model' | 'views'): number {
  const match = new RegExp(`\\b${block}\\s*\\{`).exec(source)
  if (!match) {
    throw new Error(`The source needs a ${block} block before this command can be applied.`)
  }
  let quote: '\'' | '"' | null = null
  let escaped = false
  let depth = 0
  for (let index = match.index + match[0].length - 1; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (!escaped && character === quote) quote = null
      escaped = !escaped && character === '\\'
      continue
    }
    if (character === '\'' || character === '"') {
      quote = character
      continue
    }
    if (character === '{') depth += 1
    if (character === '}') depth -= 1
    if (depth === 0) return index
  }
  throw new Error(`The ${block} block is not closed.`)
}

function appendToBlock(source: string, block: 'model' | 'views', statement: string): string {
  const index = findBlockEnd(source, block)
  return `${source.slice(0, index)}\n  ${statement}\n${source.slice(index)}`
}

function assertIdentifier(value: string, label: string): void {
  if (!identifier.test(value)) throw new Error(`${label} must be an identifier.`)
}

function assertFqn(value: string, label: string): void {
  if (!fqn.test(value)) throw new Error(`${label} must be an element FQN.`)
}

/** Applies one explicit GUI command to the canonical DSL document. */
export function applyCommand(source: string, command: EditorCommand): string {
  switch (command.type) {
    case 'add-element':
      assertIdentifier(command.id, 'Element ID')
      assertIdentifier(command.kind, 'Element kind')
      if (!command.title.trim()) throw new Error('Element title is required.')
      return appendToBlock(source, 'model', `${command.id} = ${command.kind} ${quoted(command.title.trim())}`)
    case 'add-relation':
      assertFqn(command.source, 'Relation source')
      assertFqn(command.target, 'Relation target')
      return appendToBlock(
        source,
        'model',
        `${command.source} -> ${command.target}${command.title.trim() ? ` ${quoted(command.title.trim())}` : ''}`,
      )
    case 'add-view':
      assertIdentifier(command.id, 'View ID')
      assertFqn(command.of, 'View scope')
      return appendToBlock(source, 'views', `view ${command.id} of ${command.of} { include * }`)
  }
}
