import type { ElementIconRenderer } from '@likec4/diagram'
import DockerIcon from '@likec4/icons/tech/docker'
import KafkaIcon from '@likec4/icons/tech/kafka'
import NodejsIcon from '@likec4/icons/tech/nodejs'
import PostgresqlIcon from '@likec4/icons/tech/postgresql'
import ReactIcon from '@likec4/icons/tech/react'
import RedisIcon from '@likec4/icons/tech/redis'
import { technologyCatalogue } from './technology-catalogue'

const technologyIcons = new Map([
  ['tech:postgresql', PostgresqlIcon],
  ['tech:redis', RedisIcon],
  ['tech:kafka', KafkaIcon],
  ['tech:nodejs', NodejsIcon],
  ['tech:react', ReactIcon],
  ['tech:docker', DockerIcon],
])

/** Render bundled SVGs in both inspector and diagram without fetching remote images. */
export const renderTechnologyIcon: ElementIconRenderer = ({ node, className }) => {
  if (!node.icon) return null
  const Icon = technologyIcons.get(node.icon)
  if (!Icon) return null
  const technology = technologyCatalogue.find(entry => entry.icon === node.icon)
  return (
    <Icon
      className={className}
      width="100%"
      height="100%"
      role="img"
      aria-label={`Логотип технологии ${technology?.label ?? node.title}`}
      data-technology-icon={node.icon} />
  )
}
