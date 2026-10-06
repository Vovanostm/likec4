import type { FormEvent } from 'react'
import { useState } from 'react'
import type { useWp06Runtime } from '../use-wp06-runtime'

type Wp06 = ReturnType<typeof useWp06Runtime>

export interface Wp06ControlsProps {
  readonly wp06: Wp06
  readonly busy: boolean
}

export function Wp06Controls({ wp06, busy }: Wp06ControlsProps) {
  const [dynamicId, setDynamicId] = useState('')
  const [dynamicTitle, setDynamicTitle] = useState('')
  const [stepSource, setStepSource] = useState('')
  const [stepTarget, setStepTarget] = useState('')
  const [deploymentViewId, setDeploymentViewId] = useState('')
  const [deploymentViewTitle, setDeploymentViewTitle] = useState('')
  const [nodeKind, setNodeKind] = useState('')
  const [nodeId, setNodeId] = useState('')
  const [nodeTitle, setNodeTitle] = useState('')
  const [parentId, setParentId] = useState('')
  const [instanceId, setInstanceId] = useState('')
  const [logicalTarget, setLogicalTarget] = useState('')
  const [relationSource, setRelationSource] = useState('')
  const [relationTarget, setRelationTarget] = useState('')

  const submit = (action: () => Promise<boolean>, reset?: () => void) => (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    void action().then(saved => {
      if (saved) reset?.()
    })
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
      <summary>Сценарии и развёртывание</summary>
      <section aria-label="Сценарии и развёртывание">
        <form
          onSubmit={submit(() => wp06.createDynamicView(dynamicId, dynamicTitle), () => {
            setDynamicId('')
            setDynamicTitle('')
          })}>
          <h3>Создать динамический вид</h3>
          <details>
            <summary>Идентификатор (необязательно)</summary>
            <label>
              ID динамического вида<input
                aria-label="ID динамического вида"
                value={dynamicId}
                disabled={busy}
                onChange={event => setDynamicId(event.target.value)} />
            </label>
            <p className="muted">Если оставить пустым, идентификатор будет создан автоматически.</p>
          </details>
          <label>
            Название (необязательно)<input
              aria-label="Название динамического вида"
              value={dynamicTitle}
              disabled={busy}
              onChange={event => setDynamicTitle(event.target.value)} />
          </label>
          <button type="submit" disabled={busy}>Создать динамический вид</button>
        </form>

        {wp06.selectedViewType === 'dynamic' && (
          <section aria-label="Создание динамического шага">
            <p>Добавьте шаг: выберите исходный и целевой элементы.</p>
            <h3>Добавить шаг</h3>
            <button
              type="button"
              aria-pressed={wp06.connectionMode === 'dynamic-step'}
              disabled={busy || wp06.selectedViewType !== 'dynamic' || wp06.logicalElements.length < 2}
              onClick={wp06.activateDynamicStep}>
              Добавить шаг на холсте
            </button>
            <form onSubmit={submit(() => wp06.createDynamicStep(stepSource, stepTarget))}>
              <label>
                Исходный элемент<select
                  aria-label="Исходный элемент динамического шага"
                  value={stepSource}
                  disabled={busy || wp06.selectedViewType !== 'dynamic'}
                  onChange={event => setStepSource(event.target.value)}>
                  <option value="">Выберите исходный элемент</option>
                  {wp06.logicalElements.map(element => (
                    <option key={element.id} value={element.id}>{element.title} ({element.id})</option>
                  ))}
                </select>
              </label>
              <label>
                Целевой элемент<select
                  aria-label="Целевой элемент динамического шага"
                  value={stepTarget}
                  disabled={busy || wp06.selectedViewType !== 'dynamic'}
                  onChange={event => setStepTarget(event.target.value)}>
                  <option value="">Выберите целевой элемент</option>
                  {wp06.logicalElements.map(element => (
                    <option key={element.id} value={element.id}>{element.title} ({element.id})</option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={busy || wp06.selectedViewType !== 'dynamic' || !stepSource || !stepTarget ||
                  stepSource === stepTarget}>
                Создать направленный шаг
              </button>
            </form>
          </section>
        )}

        <form
          onSubmit={submit(() => wp06.createDeploymentView(deploymentViewId, deploymentViewTitle), () => {
            setDeploymentViewId('')
            setDeploymentViewTitle('')
          })}>
          <h3>Создать вид развёртывания</h3>
          <details>
            <summary>Идентификатор (необязательно)</summary>
            <label>
              ID вида развёртывания<input
                aria-label="ID вида развёртывания"
                value={deploymentViewId}
                disabled={busy}
                onChange={event => setDeploymentViewId(event.target.value)} />
            </label>
            <p className="muted">Если оставить пустым, идентификатор будет создан автоматически.</p>
          </details>
          <label>
            Название (необязательно)<input
              aria-label="Название вида развёртывания"
              value={deploymentViewTitle}
              disabled={busy}
              onChange={event => setDeploymentViewTitle(event.target.value)} />
          </label>
          <button type="submit" disabled={busy}>Создать вид развёртывания</button>
        </form>

        {wp06.selectedViewType === 'deployment' && (
          <>
            {wp06.deploymentKinds.length === 0 && (
              <p className="empty">
                В спецификации проекта нет типов узлов развёртывания. Импортируйте модель с deploymentNode или начните
                новый пустой проект.
              </p>
            )}
            <form
              onSubmit={submit(() => wp06.createDeploymentNode(nodeKind, nodeId, nodeTitle), () => {
                setNodeId('')
                setNodeTitle('')
              })}>
              <h3>Создать узел развёртывания</h3>
              <label>
                Тип узла<select
                  aria-label="Тип узла развёртывания"
                  value={nodeKind}
                  disabled={busy || wp06.deploymentKinds.length === 0}
                  onChange={event => setNodeKind(event.target.value)}>
                  <option value="">Выберите тип узла</option>
                  {wp06.deploymentKinds.map(kind => <option key={kind} value={kind}>{kind}</option>)}
                </select>
              </label>
              <details>
                <summary>Идентификатор (необязательно)</summary>
                <label>
                  ID узла<input
                    aria-label="ID узла развёртывания"
                    value={nodeId}
                    disabled={busy}
                    onChange={event => setNodeId(event.target.value)} />
                </label>
                <p className="muted">Если оставить пустым, идентификатор будет создан автоматически.</p>
              </details>
              <label>
                Название<input
                  aria-label="Название узла развёртывания"
                  value={nodeTitle}
                  disabled={busy}
                  onChange={event => setNodeTitle(event.target.value)} />
              </label>
              <button type="submit" disabled={busy || !nodeKind}>Создать узел развёртывания</button>
            </form>

            <form
              onSubmit={submit(() => wp06.createDeploymentInstance(parentId, instanceId, logicalTarget), () => {
                setInstanceId('')
              })}>
              <h3>Создать экземпляр</h3>
              <label>
                Родительский узел<select
                  aria-label="Родительский узел"
                  value={parentId}
                  disabled={busy || wp06.deploymentNodes.length === 0}
                  onChange={event => setParentId(event.target.value)}>
                  <option value="">Выберите родительский узел</option>
                  {wp06.deploymentNodes.map(element => (
                    <option key={element.id} value={element.id}>{element.title} ({element.id})</option>
                  ))}
                </select>
              </label>
              <label>
                Логический элемент<select
                  aria-label="Логический элемент экземпляра"
                  value={logicalTarget}
                  disabled={busy || wp06.logicalElements.length === 0}
                  onChange={event => setLogicalTarget(event.target.value)}>
                  <option value="">Выберите логический элемент</option>
                  {wp06.logicalElements.map(element => (
                    <option key={element.id} value={element.id}>{element.title} ({element.id})</option>
                  ))}
                </select>
              </label>
              <details>
                <summary>Идентификатор (необязательно)</summary>
                <label>
                  ID экземпляра<input
                    aria-label="ID экземпляра"
                    value={instanceId}
                    disabled={busy}
                    onChange={event => setInstanceId(event.target.value)} />
                </label>
                <p className="muted">Если оставить пустым, идентификатор будет создан автоматически.</p>
              </details>
              <button type="submit" disabled={busy || !parentId || !logicalTarget}>Создать экземпляр</button>
              {wp06.deploymentNodes.length === 0 && (
                <p className="muted">Сначала создайте узел развёртывания, в котором будет размещён экземпляр.</p>
              )}
              {wp06.logicalElements.length === 0 && (
                <p className="muted">Для экземпляра нужен логический элемент. Добавьте его в статическом виде.</p>
              )}
            </form>

            <section aria-label="Создание связи развёртывания">
              <h3>Создать связь развёртывания</h3>
              <button
                type="button"
                aria-pressed={wp06.connectionMode === 'deployment-relation'}
                disabled={busy || wp06.selectedViewType !== 'deployment' || wp06.deploymentElements.length < 2}
                onClick={wp06.activateDeploymentRelation}>
                Создать связь развёртывания на холсте
              </button>
              <form onSubmit={submit(() => wp06.createDeploymentRelation(relationSource, relationTarget))}>
                <label>
                  Исходная сущность развёртывания<select
                    aria-label="Исходная сущность развёртывания"
                    value={relationSource}
                    disabled={busy}
                    onChange={event => setRelationSource(event.target.value)}>
                    <option value="">Выберите исходную сущность</option>
                    {wp06.deploymentElements.map(element => (
                      <option key={element.id} value={element.id}>{element.title} ({element.id})</option>
                    ))}
                  </select>
                </label>
                <label>
                  Целевая сущность развёртывания<select
                    aria-label="Целевая сущность развёртывания"
                    value={relationTarget}
                    disabled={busy}
                    onChange={event => setRelationTarget(event.target.value)}>
                    <option value="">Выберите целевую сущность</option>
                    {wp06.deploymentElements.map(element => (
                      <option key={element.id} value={element.id}>{element.title} ({element.id})</option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={busy || !relationSource || !relationTarget || relationSource === relationTarget}>
                  Создать связь развёртывания
                </button>
              </form>
            </section>
          </>
        )}

        {wp06.connectionMode && (
          <button type="button" disabled={busy} onClick={wp06.cancelConnection}>Отменить создание связи</button>
        )}
      </section>
    </details>
  )
}
