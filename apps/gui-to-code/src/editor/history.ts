import type { EditorCommand, EditorHistory, EditorHistoryAction, LayoutCommand } from './contracts'

/** Each row denotes the state AFTER its command, including states available for Redo. */
export function historySteps(history: EditorHistory) {
  return [
    ...history.past.map(entry => entry.action),
    history.current,
    ...history.future.toReversed().map(entry => entry.action),
  ].map((action, index) => ({
    index,
    action,
    current: index === history.past.length,
    undone: index > history.past.length,
  }))
}

/** Command labels are recorded at commit time, independent of later model/selection changes. */
export function describeHistoryCommand(command: EditorCommand | LayoutCommand): EditorHistoryAction {
  switch (command.type) {
    case 'diagram.create':
      return { type: command.type, label: 'Создание диаграммы' }
    case 'element.create':
    case 'element.createAt':
      return {
        type: command.type,
        label: `Создание элемента: ${command.input.title ?? command.input.id ?? command.input.kind}`,
      }
    case 'element.createConnected':
      return { type: command.type, label: 'Создание элемента со связью' }
    case 'element.patch':
      return { type: command.type, label: `Свойства элемента: ${command.input.id}` }
    case 'element.rename':
      return { type: command.type, label: `Переименование: ${command.input.id} → ${command.input.newId}` }
    case 'element.move':
      return { type: command.type, label: `Изменение вложенности: ${command.input.id}` }
    case 'element.remove':
      return { type: command.type, label: `Удаление элемента: ${command.input.id}` }
    case 'relation.create':
      return { type: command.type, label: `Создание связи: ${command.input.sourceId} → ${command.input.targetId}` }
    case 'relation.patch':
      return { type: command.type, label: 'Свойства связи' }
    case 'relation.remove':
      return { type: command.type, label: 'Удаление связи' }
    case 'view.create':
    case 'dynamicView.create':
    case 'deploymentView.create':
      return { type: command.type, label: `Создание вида: ${command.input.title ?? command.input.id ?? 'Новый вид'}` }
    case 'dynamicStep.create':
      return { type: command.type, label: `Создание шага: ${command.input.viewId}` }
    case 'dynamicStep.patch':
      return { type: command.type, label: `Название шага: ${command.input.viewId}` }
    case 'dynamicStep.remove':
      return { type: command.type, label: `Удаление шага: ${command.input.viewId}` }
    case 'deploymentElement.create':
      return { type: command.type, label: `Создание элемента развёртывания: ${command.input.id}` }
    case 'deploymentRelation.create':
      return { type: command.type, label: 'Создание связи развёртывания' }
    case 'deploymentRelation.patch':
      return { type: command.type, label: 'Название связи развёртывания' }
    case 'deploymentRelation.remove':
      return { type: command.type, label: 'Удаление связи развёртывания' }
    case 'tag.create':
      return { type: command.type, label: `Создание тега: ${command.input.name}` }
    case 'layout.save':
      return { type: command.type, label: `Ручная раскладка: ${command.input.viewId}` }
    case 'layout.reset':
      return { type: command.type, label: `Авторасстановка: ${command.input.viewId}` }
  }
}
