// Runs the API server (restarts on change) and the Vite dev server together.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const run = (args: string[]) =>
  spawn(process.execPath, args, { stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 0))

run(['--watch', 'server/index.ts'])
// Vite's JS entry via node, not `npx vite`: spawning npx needs a shell on Windows (npx.cmd).
run([fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))])
