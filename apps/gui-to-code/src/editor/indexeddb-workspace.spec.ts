import { describe, expect, it } from 'vitest'
import {
  type PersistenceLoadResult,
  IndexedDbWorkspacePersistence,
} from './indexeddb-workspace'
import {
  type PersistedWorkspaceEnvelope,
  workspaceSchema,
  workspaceVersion,
} from './persisted-workspace'

const testDatabaseName = 'likec4-gui-to-code-test'

function workspace(revision: number, content = `model revision-${revision}`): PersistedWorkspaceEnvelope {
  return {
    schema: workspaceSchema,
    version: workspaceVersion,
    workspaceId: 'test',
    revision,
    savedAt: `2026-08-03T00:00:0${revision}.000Z`,
    sources: [{ uri: 'model.c4', content }],
    manualLayouts: {},
    metadata: { entryDocumentUri: 'model.c4' },
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

interface FakeDatabaseData {
  version: number
  hasWorkspaceStore: boolean
  records: Map<string, unknown>
  writeError?: DOMException
}

class FakeRequest<T> {
  result!: T
  error: DOMException | null = null
  onsuccess: (() => void) | null = null
  onerror: (() => void) | null = null
}

class FakeTransaction {
  oncomplete: (() => void) | null = null
  onabort: (() => void) | null = null
  onerror: (() => void) | null = null
  private pending = 0
  private completionScheduled = false
  private readonly ready: Promise<void>
  private release!: () => void
  private readonly records = new Map<string, unknown>()
  private started = false
  readonly finished: Promise<void>
  error: DOMException | null = null

  constructor(private readonly data: FakeDatabaseData, predecessor: Promise<void> = Promise.resolve()) {
    this.ready = predecessor.then(() => {
      for (const [key, value] of data.records) this.records.set(key, clone(value))
      this.started = true
    })
    this.finished = new Promise(resolve => {
      this.release = resolve
    })
  }

  objectStore(): IDBObjectStore {
    return new FakeObjectStore(this, { ...this.data, records: this.records }) as unknown as IDBObjectStore
  }

  request<T>(operation: () => T): IDBRequest<T> {
    this.pending++
    const request = new FakeRequest<T>()
    void this.ready.then(() => {
      try {
        request.result = operation()
        request.onsuccess?.()
      } finally {
        this.pending--
        this.scheduleCompletion()
      }
    })
    return request as unknown as IDBRequest<T>
  }

  enqueue(operation: () => void): IDBRequest<undefined> {
    this.pending++
    const request = new FakeRequest<undefined>()
    void this.ready.then(() => {
      try {
        if (this.error) return
        if (this.data.writeError) {
          this.error = this.data.writeError
          delete this.data.writeError
          request.error = this.error
          request.onerror?.()
          return
        }
        operation()
        request.result = undefined
        request.onsuccess?.()
      } finally {
        this.pending--
        this.scheduleCompletion()
      }
    })
    return request as unknown as IDBRequest<undefined>
  }

  scheduleCompletion(): void {
    if (this.completionScheduled) return
    this.completionScheduled = true
    setTimeout(() => {
      this.completionScheduled = false
      if (this.pending === 0 && this.started) {
        if (this.error) this.onabort?.()
        else {
          this.data.records = this.records
          this.oncomplete?.()
        }
        this.release()
      }
      else this.scheduleCompletion()
    }, 0)
  }
}

class FakeObjectStore {
  constructor(private readonly transaction: FakeTransaction, private readonly data: FakeDatabaseData) {}

  get(key: string): IDBRequest<unknown> {
    return this.transaction.request(() => {
      const value = this.data.records.get(key)
      return value === undefined ? undefined : clone(value)
    })
  }

  put(value: unknown, key: string): IDBRequest<undefined> {
    return this.transaction.enqueue(() => {
      this.data.records.set(key, clone(value))
    })
  }

  delete(key: string): IDBRequest<undefined> {
    return this.transaction.enqueue(() => {
      this.data.records.delete(key)
    })
  }
}

class FakeDatabase {
  onversionchange: (() => void) | null = null
  closed = false
  closeCount = 0
  readonly objectStoreNames = {
    contains: (name: string) => name === 'workspace' && this.data.hasWorkspaceStore,
  }

  constructor(private readonly data: FakeDatabaseData, private readonly owner: FakeIndexedDb) {}

  createObjectStore(): IDBObjectStore {
    this.data.hasWorkspaceStore = true
    return undefined as unknown as IDBObjectStore
  }

  transaction(): IDBTransaction {
    if (this.closed) throw new DOMException('Closed', 'InvalidStateError')
    const transaction = new FakeTransaction(this.data, this.owner.queue)
    this.owner.queue = transaction.finished
    return transaction as unknown as IDBTransaction
  }

  close(): void {
    this.closed = true
    this.closeCount++
  }
}

class FakeIndexedDb {
  queue: Promise<void> = Promise.resolve()
  readonly connections: FakeDatabase[] = []
  private readonly databases = new Map<string, FakeDatabaseData>()

  open(name: string, version: number): IDBOpenDBRequest {
    let data = this.databases.get(name)
    const oldVersion = data?.version ?? 0
    if (!data) {
      data = { version, hasWorkspaceStore: false, records: new Map() }
      this.databases.set(name, data)
    }
    const request = new FakeRequest<IDBDatabase>() as FakeRequest<IDBDatabase> & {
      onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null
      transaction: IDBTransaction | null
    }
    request.onupgradeneeded = null
    const database = new FakeDatabase(data, this)
    this.connections.push(database)
    request.result = database as unknown as IDBDatabase
    request.transaction = null
    setTimeout(async () => {
      if (oldVersion > version) {
        request.error = new DOMException('Older version', 'VersionError')
        request.onerror?.()
        return
      }
      if (oldVersion < version) {
        for (const connection of this.connections) {
          if (connection !== database && !connection.closed) connection.onversionchange?.()
        }
        const transaction = new FakeTransaction(data!, this.queue)
        this.queue = transaction.finished
        request.transaction = transaction as unknown as IDBTransaction
        request.onupgradeneeded?.({ oldVersion } as IDBVersionChangeEvent)
        transaction.scheduleCompletion()
        await transaction.finished
        data!.version = version
      }
      request.onsuccess?.()
    }, 0)
    return request as unknown as IDBOpenDBRequest
  }

  seedV1(value: PersistedWorkspaceEnvelope, version = 1, backup?: PersistedWorkspaceEnvelope): void {
    this.databases.set(testDatabaseName, {
      version,
      hasWorkspaceStore: true,
      records: new Map([['active', clone(value)], ...(backup ? [['backup', clone(backup)] as const] : [])]),
    })
  }

  raw(key: string): unknown {
    return this.databases.get(testDatabaseName)?.records.get(key)
  }

  setRaw(key: string, value: unknown): void {
    const data = this.databases.get(testDatabaseName)
    if (!data) throw new Error('Тестовая база не создана.')
    data.records.set(key, clone(value))
  }

  version(): number | undefined {
    return this.databases.get(testDatabaseName)?.version
  }

  failNextWrite(): void {
    const data = this.databases.get(testDatabaseName)
    if (!data) throw new Error('Database missing')
    data.writeError = new DOMException('Full', 'QuotaExceededError')
  }
}

function createPersistence(database = new FakeIndexedDb()): {
  readonly database: FakeIndexedDb
  readonly persistence: IndexedDbWorkspacePersistence
} {
  return {
    database,
    persistence: new IndexedDbWorkspacePersistence({
      indexedDB: database,
      databaseName: testDatabaseName,
    }),
  }
}

async function loadResult(persistence: IndexedDbWorkspacePersistence): Promise<PersistenceLoadResult> {
  return persistence.loadWithRecovery()
}

async function saveObserved(
  persistence: IndexedDbWorkspacePersistence,
  input: { expectedPreviousRevision: number | null; workspace: PersistedWorkspaceEnvelope },
) {
  const observed = await persistence.loadWithRecovery()
  return persistence.save({ ...input, expectedToken: observed.token })
}

describe('IndexedDB workspace persistence', () => {
  for (const pair of [['save', 'save'], ['replace', 'replace'], ['save', 'replace']] as const) {
    it.each([false, true])(`serializes ${pair.join('/')} on a populated workspace (reverse=%s)`, async reverse => {
      const { database: db, persistence: a } = createPersistence()
      const { persistence: b } = createPersistence(db)
      const empty = await a.loadWithRecovery()
      await a.replace(workspace(0, 'original'), empty.token)
      const { token } = await a.loadWithRecovery()
      const writers = [a, b]
      const writes = pair.map((method, index) => () => {
        const writer = writers[index]!
        const next = workspace(method === 'save' ? 1 : 0, `writer-${index}`)
        return method === 'save'
          ? writer.save({ expectedToken: token, expectedPreviousRevision: 0, workspace: next })
          : writer.replace(next, token)
      })
      if (reverse) writes.reverse()
      const results = await Promise.all(writes.map(write => write()))
      expect(results.map(result => result.status).sort()).toEqual(['conflict', 'saved'])
      expect(db.raw('backup')).toEqual(workspace(0, 'original'))
      const winner = reverse ? 1 : 0
      expect(db.raw('active')).toEqual(workspace(pair[winner] === 'save' ? 1 : 0, `writer-${winner}`))
    })
  }

  it.each([1, 2])('migrates version %s preserving multifile entry and valid backup byte-for-byte', async version => {
    const db = new FakeIndexedDb()
    const active = {
      ...workspace(2),
      sources: [{ uri: 'z.c4', content: '// exact\r\n' }, { uri: 'a.c4', content: 'other' }],
      metadata: { entryDocumentUri: 'z.c4' },
    }
    db.seedV1(active, version, workspace(1))
    const { persistence } = createPersistence(db)
    const loaded = await persistence.loadWithRecovery()
    expect(loaded).toMatchObject({ status: 'loaded', workspace: active })
    expect(loaded.token).toEqual(expect.any(String))
    expect(db.raw('active')).toEqual(active)
    expect(db.raw('backup')).toEqual(workspace(1))
    const legacy = db.open(testDatabaseName, version)
    await expect(
      new Promise((resolve, reject) => {
        legacy.onsuccess = () => resolve(legacy.result)
        legacy.onerror = () => reject(legacy.error)
      }),
    ).rejects.toMatchObject({ name: 'VersionError' })
    const connection = db.connections[0]!
    const before = connection.closeCount
    connection.onversionchange?.()
    expect(connection.closeCount).toBe(before + 1)
  })

  it('rotates the recovery token and rejects a writer loaded before recovery', async () => {
    const { database: db, persistence } = createPersistence()
    await saveObserved(persistence, { expectedPreviousRevision: null, workspace: workspace(1) })
    await saveObserved(persistence, { expectedPreviousRevision: 1, workspace: workspace(2) })
    const old = await persistence.loadWithRecovery()
    db.setRaw('active', { corrupt: true })
    const recovered = await persistence.loadWithRecovery()
    expect(recovered.token).not.toBe(old.token)
    expect(recovered).toMatchObject({ status: 'recovered-from-backup', workspace: workspace(1) })
    const before = clone([db.raw('active'), db.raw('backup'), db.raw('metadata')])
    expect(await persistence.replace(workspace(0), old.token)).toMatchObject({ status: 'conflict' })
    expect([db.raw('active'), db.raw('backup'), db.raw('metadata')]).toEqual(before)
  })

  it('leaves all durable records intact when quota aborts a write', async () => {
    const { database: db, persistence } = createPersistence()
    const { token } = await persistence.loadWithRecovery()
    await persistence.replace(workspace(1), token)
    const observed = await persistence.loadWithRecovery()
    const before = clone([db.raw('active'), db.raw('backup'), db.raw('metadata')])
    db.failNextWrite()
    await expect(
      persistence.save({ expectedToken: observed.token, expectedPreviousRevision: 1, workspace: workspace(2) }),
    )
      .rejects.toMatchObject({ name: 'QuotaExceededError' })
    expect([db.raw('active'), db.raw('backup'), db.raw('metadata')]).toEqual(before)
  })

  it('fails closed for corrupt metadata without touching envelopes', async () => {
    const { database: db, persistence } = createPersistence()
    const { token } = await persistence.loadWithRecovery()
    await persistence.replace(workspace(1), token)
    db.setRaw('backup', workspace(0))
    db.setRaw('active', { corrupt: true })
    db.setRaw('metadata', { token: null })
    const before = clone([db.raw('active'), db.raw('backup'), db.raw('metadata')])
    await expect(persistence.loadWithRecovery()).rejects.toThrow('Метаданные')
    await expect(persistence.replace(workspace(2), token)).rejects.toThrow('Метаданные')
    await expect(persistence.save({ expectedToken: token, expectedPreviousRevision: 1, workspace: workspace(2) }))
      .rejects.toThrow('Метаданные')
    await expect(persistence.clear(token)).rejects.toThrow('Метаданные')
    expect([db.raw('active'), db.raw('backup'), db.raw('metadata')]).toEqual(before)
  })

  it('reports blocked upgrades and closes the late successful connection', async () => {
    const request = new FakeRequest<IDBDatabase>() as FakeRequest<IDBDatabase> & { onblocked: (() => void) | null }
    let closed = false
    request.result = {
      close: () => {
        closed = true
      },
    } as IDBDatabase
    const persistence = new IndexedDbWorkspacePersistence({
      indexedDB: { open: () => request as unknown as IDBOpenDBRequest },
    })
    const loading = persistence.loadWithRecovery()
    request.onblocked?.()
    await expect(loading).rejects.toThrow('заблокировано')
    request.onsuccess?.()
    expect(closed).toBe(true)
  })

  it('reports unavailable storage without a false successful load', async () => {
    const persistence = new IndexedDbWorkspacePersistence({
      indexedDB: {
        open: () => {
          throw new DOMException('Unavailable', 'SecurityError')
        },
      },
    })
    await expect(persistence.loadWithRecovery()).rejects.toMatchObject({ name: 'SecurityError' })
  })

  it('gates reused-revision import against repeated stale saves from a second session', async () => {
    const { database: db, persistence: a } = createPersistence()
    const { persistence: b } = createPersistence(db)
    const observed = await a.loadWithRecovery()
    const token = observed.token
    expect((await b.loadWithRecovery()).token).toBe(token)
    expect(await a.replace(workspace(0, 'imported'), token)).toMatchObject({ status: 'saved' })
    const before = clone([db.raw('active'), db.raw('backup'), db.raw('metadata')])
    for (const revision of [1, 2]) {
      expect(await b.save({ expectedToken: token, expectedPreviousRevision: 0, workspace: workspace(revision) }))
        .toMatchObject({ status: 'conflict' })
      expect([db.raw('active'), db.raw('backup'), db.raw('metadata')]).toEqual(before)
    }
  })

  it.each([false, true])('allows one concurrent writer from the initial empty token (reverse=%s)', async reverse => {
    const { database: db, persistence: a } = createPersistence()
    const { persistence: b } = createPersistence(db)
    const { token } = await a.loadWithRecovery()
    const writes = [
      () => a.save({ expectedToken: token, expectedPreviousRevision: null, workspace: workspace(0, 'a') }),
      () => b.replace(workspace(0, 'b'), token),
    ]
    if (reverse) writes.reverse()
    const results = await Promise.all(writes.map(write => write()))
    expect(results.map(result => result.status).sort()).toEqual(['conflict', 'saved'])
    expect(db.raw('active')).toEqual(workspace(0, reverse ? 'b' : 'a'))
  })

  it('guards clear and prevents reuse of the empty token after a clear', async () => {
    const { database: db, persistence } = createPersistence()
    const { token: emptyToken } = await persistence.loadWithRecovery()
    const result = await persistence.replace(workspace(0), emptyToken)
    expect(result.status).toBe('saved')
    if (result.status !== 'saved') throw new Error('Expected saved')
    expect(await persistence.clear(emptyToken)).toMatchObject({ status: 'conflict' })
    const cleared = await persistence.clear(result.token)
    expect(cleared.status).toBe('cleared')
    expect((await persistence.loadWithRecovery()).token).not.toBe(emptyToken)
    expect(await persistence.replace(workspace(0), emptyToken)).toMatchObject({ status: 'conflict' })
    expect(db.raw('active')).toBeUndefined()
  })

  it('creates the versioned database and loads an empty workspace', async () => {
    const { database: db, persistence } = createPersistence()

    expect(await loadResult(persistence)).toMatchObject({ status: 'empty' })
    expect(db.version()).toBe(3)
    await expect(persistence.load()).resolves.toBeNull()
  })

  it('saves active and keeps the previous valid active as backup', async () => {
    const { database: db, persistence } = createPersistence()

    await expect(saveObserved(persistence, { expectedPreviousRevision: null, workspace: workspace(1) })).resolves
      .toMatchObject({
        status: 'saved',
        revision: 1,
      })
    await expect(saveObserved(persistence, { expectedPreviousRevision: 1, workspace: workspace(2) })).resolves
      .toMatchObject({
        status: 'saved',
        revision: 2,
      })

    expect(db.raw('backup')).toEqual(workspace(1))
    expect(db.raw('active')).toEqual(workspace(2))
  })

  it('does not change active or backup for stale and conflicting saves', async () => {
    const { database: db, persistence } = createPersistence()
    await saveObserved(persistence, { expectedPreviousRevision: null, workspace: workspace(1) })
    await saveObserved(persistence, { expectedPreviousRevision: 1, workspace: workspace(2) })
    const beforeActive = db.raw('active')
    const beforeBackup = db.raw('backup')

    await expect(saveObserved(persistence, { expectedPreviousRevision: 1, workspace: workspace(1, 'stale') })).resolves
      .toMatchObject({
        status: 'stale',
        durableRevision: 2,
      })
    await expect(saveObserved(persistence, { expectedPreviousRevision: 0, workspace: workspace(3, 'conflict') }))
      .resolves
      .toMatchObject({
        status: 'conflict',
        durableRevision: 2,
      })

    expect(db.raw('active')).toEqual(beforeActive)
    expect(db.raw('backup')).toEqual(beforeBackup)
  })

  it('promotes a valid backup when active is corrupt so the recovered workspace can be saved', async () => {
    const { database: db, persistence } = createPersistence()
    await saveObserved(persistence, { expectedPreviousRevision: null, workspace: workspace(1) })
    await saveObserved(persistence, { expectedPreviousRevision: 1, workspace: workspace(2) })
    db.setRaw('active', { corrupt: true })
    await expect(loadResult(persistence)).resolves.toMatchObject({
      status: 'recovered-from-backup',
      workspace: workspace(1),
      activeError: 'Неизвестный формат workspace.',
    })
    expect(db.raw('active')).toEqual(workspace(1))
    expect(db.raw('backup')).toEqual(workspace(1))
    await expect(persistence.load()).resolves.toMatchObject(workspace(1))

    await expect(saveObserved(persistence, {
      expectedPreviousRevision: 1,
      workspace: workspace(2, 'mutated after recovery'),
    })).resolves.toMatchObject({ status: 'saved', revision: 2 })
    expect(db.raw('backup')).toEqual(workspace(1))
    expect(db.raw('active')).toEqual(workspace(2, 'mutated after recovery'))
  })

  it('does not rotate the backup for an identical same-revision save', async () => {
    const { database: db, persistence } = createPersistence()
    await saveObserved(persistence, { expectedPreviousRevision: null, workspace: workspace(1) })
    await saveObserved(persistence, { expectedPreviousRevision: 1, workspace: workspace(2) })
    const beforeActive = db.raw('active')
    const beforeBackup = db.raw('backup')
    const beforeMetadata = clone(db.raw('metadata'))

    await expect(saveObserved(persistence, { expectedPreviousRevision: 2, workspace: workspace(2) })).resolves
      .toMatchObject({
        status: 'saved',
        revision: 2,
      })

    expect(db.raw('active')).toEqual(beforeActive)
    expect(db.raw('backup')).toEqual(beforeBackup)
    expect(db.raw('metadata')).not.toEqual(beforeMetadata)
  })

  it('uses a previous valid active as backup for replacement', async () => {
    const { database: db, persistence } = createPersistence()
    await saveObserved(persistence, { expectedPreviousRevision: null, workspace: workspace(1) })

    await persistence.replace(workspace(2, 'replacement'), (await persistence.loadWithRecovery()).token)

    expect(db.raw('backup')).toEqual(workspace(1))
    expect(db.raw('active')).toEqual(workspace(2, 'replacement'))
  })

  it('keeps a valid backup when replacing a corrupt active record', async () => {
    const { database: db, persistence } = createPersistence()
    await saveObserved(persistence, { expectedPreviousRevision: null, workspace: workspace(1) })
    await saveObserved(persistence, { expectedPreviousRevision: 1, workspace: workspace(2) })
    db.setRaw('active', { corrupt: true })
    const beforeBackup = db.raw('backup')

    await persistence.replace(workspace(3, 'recovered replacement'), (await persistence.loadWithRecovery()).token)

    expect(db.raw('active')).toEqual(workspace(3, 'recovered replacement'))
    expect(db.raw('backup')).toEqual(beforeBackup)
  })

  it('fails closed when active and backup are invalid', async () => {
    const { database: db, persistence } = createPersistence()
    await saveObserved(persistence, { expectedPreviousRevision: null, workspace: workspace(1) })
    db.setRaw('active', { corrupt: 'active' })
    db.setRaw('backup', { corrupt: 'backup' })
    const beforeActive = db.raw('active')
    const beforeBackup = db.raw('backup')

    await expect(loadResult(persistence)).resolves.toMatchObject({
      status: 'invalid',
      activeError: 'Неизвестный формат workspace.',
      backupError: 'Неизвестный формат workspace.',
    })
    await expect(persistence.load()).rejects.toThrow('Не удалось восстановить workspace')
    expect(db.raw('active')).toEqual(beforeActive)
    expect(db.raw('backup')).toEqual(beforeBackup)
  })

  it('migrates a v1 database without rewriting its active envelope', async () => {
    const database = new FakeIndexedDb()
    database.seedV1(workspace(7, 'v1'))
    const { persistence } = createPersistence(database)

    await expect(loadResult(persistence)).resolves.toMatchObject({ status: 'loaded', workspace: workspace(7, 'v1') })
    expect(database.version()).toBe(3)
    expect(database.raw('active')).toEqual(workspace(7, 'v1'))

    await expect(saveObserved(persistence, { expectedPreviousRevision: 7, workspace: workspace(8) })).resolves
      .toMatchObject({
        status: 'saved',
        revision: 8,
      })
    expect(database.raw('backup')).toEqual(workspace(7, 'v1'))
  })

  it('rejects an invalid workspace before opening a write transaction', async () => {
    const { database: db, persistence } = createPersistence()
    await saveObserved(persistence, { expectedPreviousRevision: null, workspace: workspace(1) })
    const beforeActive = db.raw('active')
    const beforeBackup = db.raw('backup')

    await expect(saveObserved(persistence, {
      expectedPreviousRevision: 1,
      workspace: { ...workspace(2), sources: [] },
    })).rejects.toThrow('допустимого набора исходников')
    expect(db.raw('active')).toEqual(beforeActive)
    expect(db.raw('backup')).toEqual(beforeBackup)
  })

  it('clears active and backup together', async () => {
    const { database: db, persistence } = createPersistence()
    await saveObserved(persistence, { expectedPreviousRevision: null, workspace: workspace(1) })
    await saveObserved(persistence, { expectedPreviousRevision: 1, workspace: workspace(2) })

    await persistence.clear((await persistence.loadWithRecovery()).token)

    expect(db.raw('active')).toBeUndefined()
    expect(db.raw('backup')).toBeUndefined()
    await expect(persistence.load()).resolves.toBeNull()
  })
})
