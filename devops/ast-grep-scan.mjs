#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const packageJson = require.resolve('@ast-grep/cli/package.json')
const packageRoot = path.dirname(packageJson)
const binaryName = process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep'
// These rules protect architectural invariants. Keep warning severity in the rule files for
// editor/reporting ergonomics, but promote every project rule to an error in the CI-facing scan.
const result = spawnSync(path.join(packageRoot, binaryName), ['scan', '--error', ...process.argv.slice(2)], {
  stdio: 'inherit',
})

if (result.error) {
  console.error(`Unable to run @ast-grep/cli: ${result.error.message}`)
  process.exitCode = 1
} else {
  process.exitCode = result.status ?? 1
}
