import { spawn } from 'node:child_process'
import { get } from 'node:http'
import { createServer } from 'node:net'

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a local port.')))
        return
      }
      server.close(() => resolve(address.port))
    })
  })
}

async function probe(url) {
  return await new Promise((resolve, reject) => {
    const request = get(url, { timeout: 1_000 }, response => {
      let html = ''
      response.setEncoding('utf8')
      response.on('data', chunk => html += chunk)
      response.on('end', () => {
        const status = response.statusCode ?? 0
        if (status < 200 || status >= 400) {
          reject(new Error(`Preview returned HTTP ${status}.`))
          return
        }
        if (!html.includes('id="likec4-root"')) {
          reject(new Error('Preview HTML does not contain #likec4-root.'))
          return
        }
        resolve()
      })
    })
    request.on('timeout', () => request.destroy(new Error('Preview probe timed out.')))
    request.on('error', reject)
  })
}

const port = await freePort()
const url = `http://127.0.0.1:${port}/`
const child = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: new URL('..', import.meta.url),
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
let lastProbeError = null
let passed = false
child.stdout.on('data', chunk => output += chunk)
child.stderr.on('data', chunk => output += chunk)

const deadline = Date.now() + 15_000
try {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Preview exited early (${child.exitCode}).\n${output}`)
    try {
      await probe(url)
      console.log(`GUI-to-code startup smoke passed at ${url}`)
      passed = true
      break
    } catch (error) {
      lastProbeError = error
      await new Promise(resolve => setTimeout(resolve, 150))
    }
  }
  if (!passed) {
    const reason = lastProbeError instanceof Error ? lastProbeError.message : String(lastProbeError)
    throw new Error(`Preview did not become ready: ${reason}\n${output}`)
  }
} finally {
  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 2_000)),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
}
