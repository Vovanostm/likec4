import type { FormEvent } from 'react'
import { useState } from 'react'
import type { useWp06Runtime } from '../use-wp06-runtime'

type Wp06 = ReturnType<typeof useWp06Runtime>

export interface Wp06ControlsProps {
  readonly wp06: Wp06
  readonly busy: boolean
}

export function Wp06Controls({ wp06, busy }: Wp06ControlsProps) {
  const [dynamicId, setDynamicId] = useState('flow')
  const [dynamicTitle, setDynamicTitle] = useState('')
  const [stepSource, setStepSource] = useState('')
  const [stepTarget, setStepTarget] = useState('')
  const [deploymentViewId, setDeploymentViewId] = useState('production')
  const [deploymentViewTitle, setDeploymentViewTitle] = useState('')
  const [nodeKind, setNodeKind] = useState('')
  const [nodeId, setNodeId] = useState('')
  const [nodeTitle, setNodeTitle] = useState('')
  const [parentId, setParentId] = useState('')
  const [instanceId, setInstanceId] = useState('')
  const [logicalTarget, setLogicalTarget] = useState('')
  const [relationSource, setRelationSource] = useState('')
  const [relationTarget, setRelationTarget] = useState('')

  const submit = (action: () => Promise<boolean>) => (event: FormEvent) => {
    event.preventDefault()
    void action()
  }

  return (
    <details
      className="wp06-controls"
      onKeyDown={event => {
        if (event.key === 'Escape' && wp06.connectionMode) {
          event.stopPropagation()
          wp06.cancelConnection()
        }
      }}>
      <summary>Dynamic и deployment</summary>
      <section aria-label="Dynamic и deployment workflows">
        <h2>Dynamic и deployment</h2>

        <form onSubmit={submit(() => wp06.createDynamicView(dynamicId, dynamicTitle))}>
          <h3>Создать динамический вид</h3>
          <label>ID динамического вида<input aria-label="ID динамического вида" value={dynamicId} disabled={busy} onChange={event => setDynamicId(event.target.value)} /></label>
          <label>Название<input aria-label="Название динамического вида" value={dynamicTitle} disabled={busy} onChange={event => setDynamicTitle(event.target.value)} /></label>
          <button type="submit" disabled={busy || !dynamicId.trim()}>Создать динамический вид</button>
        </form>

        <section aria-label="Создание динамического шага">
          <h3>Добавить шаг</h3>
          <button type="button" aria-pressed={wp06.connectionMode === 'dynamic-step'} disabled={busy || wp06.selectedViewType !== 'dynamic' || wp06.logicalElements.length < 2} onClick={wp06.activateDynamicStep}>Добавить шаг на холсте</button>
          <form onSubmit={submit(() => wp06.createDynamicStep(stepSource, stepTarget))}>
            <label>Исходный элемент<select aria-label="Исходный элемент динамического шага" value={stepSource} disabled={busy || wp06.selectedViewType !== 'dynamic'} onChange={event => setStepSource(event.target.value)}><option value="">Выберите исходный элемент</option>{wp06.logicalElements.map(element => <option key={element.id} value={element.id}>{element.title} ({element.id})</option>)}</select></label>
            <label>Целевой элемент<select aria-label="Целевой элемент динамического шага" value={stepTarget} disabled={busy || wp06.selectedViewType !== 'dynamic'} onChange={event => setStepTarget(event.target.value)}><option value="">Выберите целевой элемент</option>{wp06.logicalElements.map(element => <option key={element.id} value={element.id}>{element.title} ({element.id})</option>)}</select></label>
            <button type="submit" disabled={busy || wp06.selectedViewType !== 'dynamic' || !stepSource || !stepTarget || stepSource === stepTarget}>Создать направленный шаг</button>
          </form>
        </section>

        <form onSubmit={submit(() => wp06.createDeploymentView(deploymentViewId, deploymentViewTitle))}>
          <h3>Создать deployment-вид</h3>
          <label>ID deployment-вида<input aria-label="ID deployment-вида" value={deploymentViewId} disabled={busy} onChange={event => setDeploymentViewId(event.target.value)} /></label>
          <label>Название<input aria-label="Название deployment-вида" value={deploymentViewTitle} disabled={busy} onChange={event => setDeploymentViewTitle(event.target.value)} /></label>
          <button type="submit" disabled={busy || !deploymentViewId.trim()}>Создать deployment-вид</button>
        </form>

        <form onSubmit={submit(() => wp06.createDeploymentNode(nodeKind, nodeId, nodeTitle))}>
          <h3>Создать узел развёртывания</h3>
          <label>Тип узла<select aria-label="Тип узла развёртывания" value={nodeKind} disabled={busy || wp06.deploymentKinds.length === 0} onChange={event => setNodeKind(event.target.value)}><option value="">Выберите тип узла</option>{wp06.deploymentKinds.map(kind => <option key={kind} value={kind}>{kind}</option>)}</select></label>
          <label>ID узла<input aria-label="ID узла развёртывания" value={nodeId} disabled={busy} onChange={event => setNodeId(event.target.value)} /></label>
          <label>Название<input aria-label="Название узла развёртывания" value={nodeTitle} disabled={busy} onChange={event => setNodeTitle(event.target.value)} /></label>
          <button type="submit" disabled={busy || !nodeKind || !nodeId.trim()}>Создать узел развёртывания</button>
        </form>

        <form onSubmit={submit(() => wp06.createDeploymentInstance(parentId, instanceId, logicalTarget))}>
          <h3>Создать экземпляр</h3>
          <label>Родительский узел<select aria-label="Родительский узел" value={parentId} disabled={busy || wp06.deploymentNodes.length === 0} onChange={event => setParentId(event.target.value)}><option value="">Выберите родительский узел</option>{wp06.deploymentNodes.map(element => <option key={element.id} value={element.id}>{element.title} ({element.id})</option>)}</select></label>
          <label>Логический элемент<select aria-label="Логический элемент экземпляра" value={logicalTarget} disabled={busy || wp06.logicalElements.length === 0} onChange={event => setLogicalTarget(event.target.value)}><option value="">Выберите логический элемент</option>{wp06.logicalElements.map(element => <option key={element.id} value={element.id}>{element.title} ({element.id})</option>)}</select></label>
          <label>ID экземпляра<input aria-label="ID экземпляра" value={instanceId} disabled={busy} onChange={event => setInstanceId(event.target.value)} /></label>
          <button type="submit" disabled={busy || !parentId || !logicalTarget || !instanceId.trim()}>Создать экземпляр</button>
        </form>

        <section aria-label="Создание deployment-связи">
          <h3>Создать deployment-связь</h3>
          <button type="button" aria-pressed={wp06.connectionMode === 'deployment-relation'} disabled={busy || wp06.selectedViewType !== 'deployment' || wp06.deploymentElements.length < 2} onClick={wp06.activateDeploymentRelation}>Создать deployment-связь на холсте</button>
          <form onSubmit={submit(() => wp06.createDeploymentRelation(relationSource, relationTarget))}>
            <label>Исходная deployment-сущность<select aria-label="Исходная deployment-сущность" value={relationSource} disabled={busy} onChange={event => setRelationSource(event.target.value)}><option value="">Выберите исходную сущность</option>{wp06.deploymentElements.map(element => <option key={element.id} value={element.id}>{element.title} ({element.id})</option>)}</select></label>
            <label>Целевая deployment-сущность<select aria-label="Целевая deployment-сущность" value={relationTarget} disabled={busy} onChange={event => setRelationTarget(event.target.value)}><option value="">Выберите целевую сущность</option>{wp06.deploymentElements.map(element => <option key={element.id} value={element.id}>{element.title} ({element.id})</option>)}</select></label>
            <button type="submit" disabled={busy || !relationSource || !relationTarget || relationSource === relationTarget}>Создать deployment-связь</button>
          </form>
        </section>

        {wp06.connectionMode && <button type="button" disabled={busy} onClick={wp06.cancelConnection}>Отменить создание связи</button>}
      </section>
    </details>
  )
}
