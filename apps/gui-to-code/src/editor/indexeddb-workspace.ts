import type { PersistedWorkspaceEnvelope } from './persisted-workspace'
import { validateWorkspaceEnvelope } from './persisted-workspace'

const databaseName = 'likec4-gui-to-code'
const databaseVersion = 3
const storeName = 'workspace'
const activeKey = 'active'
const backupKey = 'backup'
const metadataKey = 'metadata'

/** Opaque storage generation, independent of semantic revision and portable data. */
export type DurableWorkspaceToken = string

export type PersistenceSaveResult =
  | { readonly status: 'saved'; readonly revision: number; readonly token: DurableWorkspaceToken }
  | { readonly status: 'stale'; readonly durableRevision: number }
  | { readonly status: 'conflict'; readonly durableRevision: number }

export type PersistenceLoadResult =
  & { readonly token: DurableWorkspaceToken }
  & (
    | { readonly status: 'empty' }
    | { readonly status: 'loaded'; readonly workspace: PersistedWorkspaceEnvelope }
    | {
      readonly status: 'recovered-from-backup'
      readonly workspace: PersistedWorkspaceEnvelope
      readonly activeError: string
    }
    | {
      readonly status: 'invalid'
      readonly activeError: string
      readonly backupError: string
    }
  )

export type PersistenceClearResult =
  | { readonly status: 'cleared'; readonly token: DurableWorkspaceToken }
  | { readonly status: 'conflict'; readonly durableRevision: number }

export interface IndexedDbWorkspacePersistenceOptions {
  readonly indexedDB?: Pick<IDBFactory, 'open'>
  readonly databaseName?: string
}

export interface WorkspacePersistencePort {
  loadWithRecovery(): Promise<PersistenceLoadResult>
  load(): Promise<PersistedWorkspaceEnvelope | null>
  save(input: {
    readonly expectedToken: DurableWorkspaceToken
    readonly expectedPreviousRevision: number | null
    readonly workspace: PersistedWorkspaceEnvelope
  }): Promise<PersistenceSaveResult>
  replace(workspace: PersistedWorkspaceEnvelope, expectedToken: DurableWorkspaceToken): Promise<PersistenceSaveResult>
  clear(expectedToken: DurableWorkspaceToken): Promise<PersistenceClearResult>
}

function readToken(metadata: unknown): DurableWorkspaceToken {
  if (
    !metadata || typeof metadata !== 'object' || !('token' in metadata)
    || typeof metadata.token !== 'string' || !metadata.token
  ) {
    throw new Error('Метаданные сохранения повреждены. Экспортируйте локальную версию.')
  }
  return metadata.token
}

function rotateToken(store: IDBObjectStore): DurableWorkspaceToken {
  const token = globalThis.crypto.randomUUID()
  store.put({ token }, metadataKey)
  return token
}

function sameWorkspaceVersion(
  left: PersistedWorkspaceEnvelope,
  right: PersistedWorkspaceEnvelope,
): boolean {
  return JSON.stringify({
    schema: left.schema,
    version: left.version,
    workspaceId: left.workspaceId,
    revision: left.revision,
    sources: left.sources,
    manualLayouts: left.manualLayouts,
    metadata: left.metadata,
  }) === JSON.stringify({
    schema: right.schema,
    version: right.version,
    workspaceId: right.workspaceId,
    revision: right.revision,
    sources: right.sources,
    manualLayouts: right.manualLayouts,
    metadata: right.metadata,
  })
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

async function openDatabase(
  indexedDb: Pick<IDBFactory, 'open'>,
  name: string,
): Promise<IDBDatabase> {
  const request = indexedDb.open(name, databaseVersion)
  request.onupgradeneeded = event => {
    const database = request.result
    if (event.oldVersion < 1 && !database.objectStoreNames.contains(storeName)) {
      database.createObjectStore(storeName)
    }
    if (event.oldVersion < 3) {
      const transaction = request.transaction
      if (!transaction) throw new Error('Транзакция миграции IndexedDB отсутствует.')
      // Keep portable v1 active/backup bytes unchanged; retire v1/v2 writers.
      rotateToken(transaction.objectStore(storeName))
    }
  }
  return new Promise((resolve, reject) => {
    let blocked = false
    request.onblocked = () => {
      blocked = true
      reject(new Error('Обновление хранилища заблокировано другой вкладкой. Закройте её и перезагрузите редактор.'))
    }
    request.onerror = () => reject(request.error ?? new Error('Ошибка IndexedDB.'))
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      if (blocked) database.close()
      else resolve(database)
    }
  })
}

export class IndexedDbWorkspacePersistence implements WorkspacePersistencePort {
  private readonly indexedDb: Pick<IDBFactory, 'open'> | undefined
  private readonly name: string

  constructor(options: IndexedDbWorkspacePersistenceOptions = {}) {
    this.indexedDb = options.indexedDB ?? globalThis.indexedDB
    this.name = options.databaseName ?? databaseName
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (!this.indexedDb) throw new Error('IndexedDB недоступен в текущем окружении.')
    return openDatabase(this.indexedDb, this.name)
  }

  async loadWithRecovery(): Promise<PersistenceLoadResult> {
    const database = await this.openDatabase()
    try {
      const transaction = database.transaction(storeName, 'readwrite')
      const done = transactionDone(transaction)
      const store = transaction.objectStore(storeName)
      const [active, backup, metadata] = await Promise.all([
        requestResult(store.get(activeKey)),
        requestResult(store.get(backupKey)),
        requestResult(store.get(metadataKey)),
      ])
      const token = readToken(metadata)

      const activeResult = active == null ? null : validateWorkspaceEnvelope(active)
      if (activeResult?.ok) {
        await done
        return { status: 'loaded', workspace: activeResult.envelope, token }
      }

      const backupResult = backup == null ? null : validateWorkspaceEnvelope(backup)
      if (backupResult?.ok) {
        // Recovery is durable: the next save must see the recovered envelope as
        // active, otherwise a valid user mutation would fail closed against the
        // still-corrupt record. Keep the backup untouched for a second recovery.
        store.put(structuredClone(backupResult.envelope), activeKey)
        const recoveredToken = rotateToken(store)
        await done
        return {
          status: 'recovered-from-backup',
          token: recoveredToken,
          workspace: backupResult.envelope,
          activeError: activeResult?.message ?? 'Основная запись workspace отсутствует.',
        }
      }

      await done
      if (active == null && backup == null) return { status: 'empty', token }
      return {
        status: 'invalid',
        token,
        activeError: activeResult?.message ?? 'Основная запись workspace отсутствует.',
        backupError: backupResult?.message ?? 'Резервная запись workspace отсутствует.',
      }
    } finally {
      database.close()
    }
  }

  async load(): Promise<PersistedWorkspaceEnvelope | null> {
    const result = await this.loadWithRecovery()
    if (result.status === 'empty') return null
    if (result.status === 'invalid') {
      throw new Error(`Не удалось восстановить workspace: ${result.activeError} ${result.backupError}`)
    }
    return result.workspace
  }

  async save(input: {
    readonly expectedToken: DurableWorkspaceToken
    readonly expectedPreviousRevision: number | null
    readonly workspace: PersistedWorkspaceEnvelope
  }): Promise<PersistenceSaveResult> {
    const nextResult = validateWorkspaceEnvelope(input.workspace)
    if (!nextResult.ok) throw new Error(nextResult.message)
    const nextWorkspace = structuredClone(nextResult.envelope)
    const database = await this.openDatabase()
    try {
      const transaction = database.transaction(storeName, 'readwrite')
      const done = transactionDone(transaction)
      const store = transaction.objectStore(storeName)
      const [existing, metadata] = await Promise.all([
        requestResult(store.get(activeKey)),
        requestResult(store.get(metadataKey)),
      ])
      if (readToken(metadata) !== input.expectedToken) {
        await done
        const current = existing == null ? null : validateWorkspaceEnvelope(existing)
        return { status: 'conflict', durableRevision: current?.ok ? current.envelope.revision : 0 }
      }
      const existingResult = existing == null ? null : validateWorkspaceEnvelope(existing)
      if (existingResult && !existingResult.ok) {
        await done
        throw new Error(existingResult.message)
      }
      const current = existingResult?.envelope ?? null
      const durableRevision = current?.revision ?? null
      if (durableRevision !== null && durableRevision > nextWorkspace.revision) {
        await done
        return { status: 'stale', durableRevision }
      }
      if (durableRevision !== input.expectedPreviousRevision) {
        await done
        return { status: 'conflict', durableRevision: durableRevision ?? 0 }
      }
      if (current && durableRevision === nextWorkspace.revision) {
        if (!sameWorkspaceVersion(current, nextWorkspace)) {
          await done
          return { status: 'conflict', durableRevision }
        }
        const token = rotateToken(store)
        await done
        return { status: 'saved', revision: nextWorkspace.revision, token }
      }
      if (current) store.put(structuredClone(current), backupKey)
      store.put(nextWorkspace, activeKey)
      const token = rotateToken(store)
      await done
      return { status: 'saved', revision: nextWorkspace.revision, token }
    } finally {
      database.close()
    }
  }

  async replace(
    workspace: PersistedWorkspaceEnvelope,
    expectedToken: DurableWorkspaceToken,
  ): Promise<PersistenceSaveResult> {
    const nextResult = validateWorkspaceEnvelope(workspace)
    if (!nextResult.ok) throw new Error(nextResult.message)
    const nextWorkspace = structuredClone(nextResult.envelope)
    const database = await this.openDatabase()
    try {
      const transaction = database.transaction(storeName, 'readwrite')
      const done = transactionDone(transaction)
      const store = transaction.objectStore(storeName)
      const [existing, metadata] = await Promise.all([
        requestResult(store.get(activeKey)),
        requestResult(store.get(metadataKey)),
      ])
      const existingResult = existing == null ? null : validateWorkspaceEnvelope(existing)
      if (readToken(metadata) !== expectedToken) {
        await done
        return { status: 'conflict', durableRevision: existingResult?.ok ? existingResult.envelope.revision : 0 }
      }
      if (existingResult?.ok) store.put(structuredClone(existingResult.envelope), backupKey)
      store.put(nextWorkspace, activeKey)
      const token = rotateToken(store)
      await done
      return { status: 'saved', revision: nextWorkspace.revision, token }
    } finally {
      database.close()
    }
  }

  async clear(expectedToken: DurableWorkspaceToken): Promise<PersistenceClearResult> {
    const database = await this.openDatabase()
    try {
      const transaction = database.transaction(storeName, 'readwrite')
      const done = transactionDone(transaction)
      const store = transaction.objectStore(storeName)
      const [existing, metadata] = await Promise.all([
        requestResult(store.get(activeKey)),
        requestResult(store.get(metadataKey)),
      ])
      if (readToken(metadata) !== expectedToken) {
        await done
        const current = existing == null ? null : validateWorkspaceEnvelope(existing)
        return { status: 'conflict', durableRevision: current?.ok ? current.envelope.revision : 0 }
      }
      store.delete(activeKey)
      store.delete(backupKey)
      const token = rotateToken(store)
      await done
      return { status: 'cleared', token }
    } finally {
      database.close()
    }
  }
}
