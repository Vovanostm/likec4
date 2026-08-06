import type { Fqn, ViewId } from '@likec4/core/types'
import { useMemo, useState } from 'react'
import type { useWorkspaceRuntime } from './use-workspace-runtime'

export type Wp06ConnectionMode = 'dynamic-step' | 'deployment-relation' | null

type Runtime = ReturnType<typeof useWorkspaceRuntime>

type Option = {
  readonly id: string
  readonly title: string
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

export function useWp06Runtime(runtime: Runtime) {
  const [connectionMode, setConnectionMode] = useState<Wp06ConnectionMode>(null)
  const model = runtime.state?.lastValidModel
  const selectedView = runtime.selectedView

  const logicalElements = useMemo<Option[]>(() => {
    return Object.values(model?.$data.elements ?? {})
      .map(element => ({ id: element.id, title: element.title }))
      .sort((left, right) => left.id.localeCompare(right.id))
  }, [model])

  const deploymentKinds = useMemo<string[]>(() => {
    const specification = record(model?.$data.specification)
    const deployments = record(specification?.['deployments'])
    return Object.keys(deployments ?? {}).sort()
  }, [model])

  const deploymentElements = useMemo<Option[]>(() => {
    return Object.entries(model?.$data.deployments.elements ?? {})
      .map(([id, value]) => {
        const element = record(value)
        return { id, title: typeof element?.['title'] === 'string' ? element['title'] : id }
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  }, [model])

  const deploymentNodes = useMemo<Option[]>(() => {
    return Object.entries(model?.$data.deployments.elements ?? {})
      .filter(([, value]) => {
        const element = record(value)
        return element?.['element'] === undefined
      })
      .map(([id, value]) => {
        const element = record(value)
        return { id, title: typeof element?.['title'] === 'string' ? element['title'] : id }
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  }, [model])

  const createDynamicView = async (id: string, title: string): Promise<boolean> => {
    const result = await runtime.dispatchSemantic({
      type: 'dynamicView.create',
      input: { id, ...(title ? { title } : {}), documentUri: 'model.c4' },
    }, 'Не удалось создать динамический вид.')
    if (result?.status === 'applied' && result.command === 'dynamicView.create') {
      runtime.selectView(result.createdViewId)
      runtime.setFeedback(`Создан динамический вид ${result.createdViewId}.`)
      return true
    }
    return false
  }

  const createDynamicStep = async (sourceId: string, targetId: string): Promise<boolean> => {
    if (!selectedView || selectedView._type !== 'dynamic') {
      runtime.setCommandError('Текущий вид изменился. Создание связи отменено.')
      return false
    }
    const result = await runtime.dispatchSemantic({
      type: 'dynamicStep.create',
      input: {
        viewId: selectedView.id,
        sourceId: sourceId as Fqn,
        targetId: targetId as Fqn,
        documentUri: 'model.c4',
      },
    }, 'Не удалось создать направленный шаг.')
    if (result?.status === 'applied' && result.command === 'dynamicStep.create') {
      setConnectionMode(null)
      runtime.setFeedback(`Создан направленный шаг ${sourceId} → ${targetId}.`)
      return true
    }
    return false
  }

  const createDeploymentView = async (id: string, title: string): Promise<boolean> => {
    const result = await runtime.dispatchSemantic({
      type: 'deploymentView.create',
      input: { id, ...(title ? { title } : {}), documentUri: 'model.c4' },
    }, 'Не удалось создать deployment-вид.')
    if (result?.status === 'applied' && result.command === 'deploymentView.create') {
      runtime.selectView(result.createdViewId)
      runtime.setFeedback(`Создан deployment-вид ${result.createdViewId}.`)
      return true
    }
    return false
  }

  const createDeploymentNode = async (kind: string, id: string, title: string): Promise<boolean> => {
    const result = await runtime.dispatchSemantic({
      type: 'deploymentElement.create',
      input: {
        family: 'node',
        kind,
        id,
        ...(title ? { title } : {}),
        documentUri: 'model.c4',
      },
    }, 'Не удалось создать узел развёртывания.')
    if (result?.status === 'applied' && result.command === 'deploymentElement.create') {
      runtime.setFeedback(`Создан узел развёртывания ${result.createdDeploymentId}.`)
      return true
    }
    return false
  }

  const createDeploymentInstance = async (parentId: string, id: string, target: string): Promise<boolean> => {
    const result = await runtime.dispatchSemantic({
      type: 'deploymentElement.create',
      input: {
        family: 'instance',
        parentId: parentId as Fqn,
        id,
        target: target as Fqn,
        documentUri: 'model.c4',
      },
    }, 'Не удалось создать экземпляр.')
    if (result?.status === 'applied' && result.command === 'deploymentElement.create') {
      runtime.setFeedback(`Создан экземпляр ${result.createdDeploymentId}.`)
      return true
    }
    return false
  }

  const createDeploymentRelation = async (sourceId: string, targetId: string): Promise<boolean> => {
    if (!selectedView || selectedView._type !== 'deployment') {
      runtime.setCommandError('Текущий вид изменился. Создание связи отменено.')
      return false
    }
    const result = await runtime.dispatchSemantic({
      type: 'deploymentRelation.create',
      input: {
        sourceId: sourceId as Fqn,
        targetId: targetId as Fqn,
        documentUri: 'model.c4',
      },
    }, 'Не удалось создать deployment-связь.')
    if (result?.status === 'applied' && result.command === 'deploymentRelation.create') {
      setConnectionMode(null)
      runtime.setFeedback(`Создана deployment-связь ${sourceId} → ${targetId}.`)
      return true
    }
    return false
  }

  const activateDynamicStep = (): void => {
    if (!selectedView || selectedView._type !== 'dynamic') {
      runtime.setCommandError('Сначала выберите динамический вид.')
      return
    }
    setConnectionMode('dynamic-step')
    runtime.setCommandError(null)
    runtime.setFeedback('Соедините два логических элемента на холсте или используйте клавиатурный выбор.')
  }

  const activateDeploymentRelation = (): void => {
    if (!selectedView || selectedView._type !== 'deployment') {
      runtime.setCommandError('Сначала выберите deployment-вид.')
      return
    }
    setConnectionMode('deployment-relation')
    runtime.setCommandError(null)
    runtime.setFeedback('Соедините две deployment-сущности на холсте или используйте клавиатурный выбор.')
  }

  const completeCanvasConnection = async (sourceId: string, targetId: string): Promise<boolean> => {
    if (!selectedView) {
      runtime.setCommandError('Текущий вид изменился. Создание связи отменено.')
      return false
    }
    if (selectedView._type === 'dynamic') return createDynamicStep(sourceId, targetId)
    if (selectedView._type === 'deployment') return createDeploymentRelation(sourceId, targetId)
    return false
  }

  return {
    connectionMode,
    logicalElements,
    deploymentKinds,
    deploymentNodes,
    deploymentElements,
    selectedViewId: selectedView?.id as ViewId | undefined,
    selectedViewType: selectedView?._type,
    createDynamicView,
    createDynamicStep,
    createDeploymentView,
    createDeploymentNode,
    createDeploymentInstance,
    createDeploymentRelation,
    activateDynamicStep,
    activateDeploymentRelation,
    completeCanvasConnection,
    cancelConnection: () => {
      setConnectionMode(null)
      runtime.setFeedback('Создание связи отменено.')
    },
  }
}
