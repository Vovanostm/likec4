import type { PersistedWorkspaceEnvelope } from './persisted-workspace'
import { validateWorkspaceEnvelope } from './persisted-workspace'

const databaseName = 'likec4-gui-to-code'
const databaseVersion = 1
const storeName = 'workspace'
const durableKey = 'active'

export type PersistenceSaveResult =
  | { readonly status: 'saved'; readonly revision: number }
  | { readonly status: 'stale'; readonly durableRevision: number }
  | { readonly status: 'conflict'; readonly durableRevision: number }

export interface WorkspacePersistencePort {
  load(): Promise<PersistedWorkspaceEnvelope | null>
  save(input: {
    readonly expectedPreviousRevision: number | null
    readonly workspace: PersistedWorkspaceEnvelope
  }): Promise<PersistenceSaveResult>
  replace(workspace: PersistedWorkspaceEnvelope): Promise<void>
  clear(): Promise<void>
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Ошибка IndexedDB.'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Транзакция IndexedDB отменена.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('Ошибка транзакции IndexedDB.'))
  })
}

async function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(databaseName, databaseVersion)
  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName)
  }
  return requestResult(request)
}

export class IndexedDbWorkspacePersistence implements WorkspacePersistencePort {
  async load(): Promise<PersistedWorkspaceEnvelope | null> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(storeName, 'readonly')
      const value = await requestResult(transaction.objectStore(storeName).get(durableKey))
      await transactionDone(transaction)
      if (value == null) return null
      const validated = validateWorkspaceEnvelope(value)
      if (!validated.ok) throw new Error(validated.message)
      return validated.envelope
    } finally {
      database.close()
    }
  }

  async save(input: {
    readonly expectedPreviousRevision: number | null
    readonly workspace: PersistedWorkspaceEnvelope
  }): Promise<PersistenceSaveResult> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const existing = await requestResult(store.get(durableKey)) as PersistedWorkspaceEnvelope | undefined
      const durableRevision = existing?.revision ?? null
      if (durableRevision !== null && durableRevision > input.workspace.revision) {
        transaction.abort()
        return { status: 'stale', durableRevision }
      }
      if (durableRevision !== input.expectedPreviousRevision) {
        transaction.abort()
        return { status: 'conflict', durableRevision: durableRevision ?? 0 }
      }
      store.put(structuredClone(input.workspace), durableKey)
      await transactionDone(transaction)
      return { status: 'saved', revision: input.workspace.revision }
    } finally {
      database.close()
    }
  }

  async replace(workspace: PersistedWorkspaceEnvelope): Promise<void> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).put(structuredClone(workspace), durableKey)
      await transactionDone(transaction)
    } finally {
      database.close()
    }
  }

  async clear(): Promise<void> {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).delete(durableKey)
      await transactionDone(transaction)
    } finally {
      database.close()
    }
  }
}
