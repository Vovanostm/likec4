export interface TechnologyEntry {
  readonly label: string
  readonly icon: string
}

/** Canonical built-in LikeC4 icon identifiers, also portable in DSL and ZIP exports. */
export const technologyCatalogue: readonly TechnologyEntry[] = [
  { label: 'PostgreSQL', icon: 'tech:postgresql' },
  { label: 'Redis', icon: 'tech:redis' },
  { label: 'Kafka', icon: 'tech:kafka' },
  { label: 'Node.js', icon: 'tech:nodejs' },
  { label: 'React', icon: 'tech:react' },
  { label: 'Docker', icon: 'tech:docker' },
]

export function technologyByName(value: string): TechnologyEntry | undefined {
  const normalized = value.trim().toLowerCase()
  return technologyCatalogue.find(entry => entry.label.toLowerCase() === normalized)
}

/** Update both form fields together; free text and clearing remove a previous catalogue logo. */
export function technologyFields(technology: string): { readonly technology: string; readonly icon: string | null } {
  return { technology, icon: technologyByName(technology)?.icon ?? null }
}
