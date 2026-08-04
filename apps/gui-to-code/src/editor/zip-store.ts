const encoder = new TextEncoder()
const decoder = new TextDecoder()
const maxEntries = 256
const maxUncompressedBytes = 16 * 1024 * 1024

export interface ZipEntry {
  readonly path: string
  readonly content: Uint8Array
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function write16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true)
}

function write32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true)
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function safePath(path: string): boolean {
  return !!path && !path.includes('\\') && !path.startsWith('/') && !/^[a-zA-Z]:/.test(path)
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..')
}

export function encodeZip(entries: readonly ZipEntry[]): Uint8Array {
  const ordered = [...entries].sort((left, right) => left.path.localeCompare(right.path))
  if (ordered.length === 0 || ordered.length > maxEntries) throw new Error('Недопустимое число файлов в ZIP.')
  const seen = new Set<string>()
  let total = 0
  for (const entry of ordered) {
    const normalized = entry.path.toLocaleLowerCase()
    if (!safePath(entry.path) || seen.has(normalized)) {
      throw new Error('ZIP содержит небезопасный или повторяющийся путь.')
    }
    seen.add(normalized)
    total += entry.content.byteLength
    if (total > maxUncompressedBytes) throw new Error('ZIP превышает допустимый размер.')
  }

  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let localOffset = 0
  for (const entry of ordered) {
    const name = encoder.encode(entry.path)
    const checksum = crc32(entry.content)
    const local = new Uint8Array(30 + name.length + entry.content.length)
    const localView = new DataView(local.buffer)
    write32(localView, 0, 0x04034b50)
    write16(localView, 4, 20)
    write16(localView, 6, 0x0800)
    write16(localView, 8, 0)
    write32(localView, 14, checksum)
    write32(localView, 18, entry.content.length)
    write32(localView, 22, entry.content.length)
    write16(localView, 26, name.length)
    local.set(name, 30)
    local.set(entry.content, 30 + name.length)
    localParts.push(local)

    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    write32(centralView, 0, 0x02014b50)
    write16(centralView, 4, 20)
    write16(centralView, 6, 20)
    write16(centralView, 8, 0x0800)
    write16(centralView, 10, 0)
    write32(centralView, 16, checksum)
    write32(centralView, 20, entry.content.length)
    write32(centralView, 24, entry.content.length)
    write16(centralView, 28, name.length)
    write32(centralView, 42, localOffset)
    central.set(name, 46)
    centralParts.push(central)
    localOffset += local.length
  }
  const central = concat(centralParts)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  write32(endView, 0, 0x06054b50)
  write16(endView, 8, ordered.length)
  write16(endView, 10, ordered.length)
  write32(endView, 12, central.length)
  write32(endView, 16, localOffset)
  return concat([...localParts, central, end])
}

export function decodeZip(bytes: Uint8Array): readonly ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0
  let total = 0
  const entries: ZipEntry[] = []
  const seen = new Set<string>()
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    if (entries.length >= maxEntries) throw new Error('ZIP содержит слишком много файлов.')
    if (offset + 30 > bytes.length) throw new Error('ZIP повреждён.')
    const flags = view.getUint16(offset + 6, true)
    const method = view.getUint16(offset + 8, true)
    const checksum = view.getUint32(offset + 14, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const uncompressedSize = view.getUint32(offset + 22, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    if ((flags & 0x0009) !== 0 || method !== 0 || compressedSize !== uncompressedSize) {
      throw new Error('ZIP использует неподдерживаемое сжатие или шифрование.')
    }
    const nameStart = offset + 30
    const contentStart = nameStart + nameLength + extraLength
    const contentEnd = contentStart + uncompressedSize
    if (contentEnd > bytes.length) throw new Error('ZIP повреждён.')
    const path = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength))
    const normalized = path.toLocaleLowerCase()
    if (!safePath(path) || seen.has(normalized)) throw new Error('ZIP содержит небезопасный или повторяющийся путь.')
    const content = bytes.slice(contentStart, contentEnd)
    if (crc32(content) !== checksum) throw new Error(`Контрольная сумма ${path} не совпадает.`)
    seen.add(normalized)
    total += content.length
    if (total > maxUncompressedBytes) throw new Error('Распакованный ZIP превышает допустимый размер.')
    entries.push({ path, content })
    offset = contentEnd
  }
  if (entries.length === 0) throw new Error('ZIP не содержит workspace.')
  return entries
}
