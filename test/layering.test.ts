import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : [p]
  })

const read = (p: string) => readFileSync(p, 'utf8')

// Core code must work for any mode, so it may not import a specific one. Registries are the only exception.
const core = [
  ...files('server').filter((p) => !p.startsWith(join('server', 'modes'))),
  ...files('src/client/core'),
  'src/client/app.tsx',
  'src/client/main.tsx',
  'src/client/mode.ts',
  'src/shared/mode.ts',
  'src/shared/day.ts',
]

it('core code never imports a specific mode', () => {
  for (const p of core) expect(read(p), p).not.toMatch(/modes\/inbetween/)
})

it('only player.ts reads the player cookie', () => {
  for (const p of files('server').filter((p) => !p.endsWith('player.ts')))
    expect(read(p), p).not.toMatch(/cookies\[|inbetween_pid/)
})
