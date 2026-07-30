import { spawn } from 'node:child_process'
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

const port = await freePort()
const url = `http://127.0.0.1:${port}`
const child = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: new URL('..', import.meta.url),
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
let passed = false
child.stdout.on('data', chunk => output += chunk)
child.stderr.on('data', chunk => output += chunk)

const deadline = Date.now() + 15_000
try {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Preview exited early (${child.exitCode}).\n${output}`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      const html = await response.text()
      if (!response.ok) throw new Error(`Preview returned HTTP ${response.status}.`)
      if (!html.includes('<div id="root"></div>')) throw new Error('Preview HTML does not contain the application root.')
      console.log(`GUI-to-code startup smoke passed at ${url}`)
      passed = true
      break
    } catch {
      await new Promise(resolve => setTimeout(resolve, 150))
    }
  }
  if (!passed) throw new Error(`Preview did not become ready.\n${output}`)
} finally {
  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 2_000)),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
}
