import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDayKey } from '../src/shared/day.ts'
import type { ServerMode } from './mode.ts'

/** Parsed rounds keyed "mode/day". */
export type Puzzles = Map<string, unknown[]>

/** Loads content/<mode>/<YYYY-MM-DD>.json ({ "rounds": [...] }). Throws on any invalid file. */
export function loadContent(dir: string, modes: ServerMode[]): Puzzles {
  const out: Puzzles = new Map()
  for (const mode of modes) {
    const modeDir = join(dir, mode.meta.id)
    if (!existsSync(modeDir)) continue
    for (const file of readdirSync(modeDir).filter((f) => f.endsWith('.json'))) {
      const where = `${mode.meta.id}/${file}`
      const day = file.slice(0, -'.json'.length)
      if (!isDayKey(day)) throw new Error(`${where}: file name must be YYYY-MM-DD.json`)
      const { rounds } = JSON.parse(readFileSync(join(modeDir, file), 'utf8'))
      if (!Array.isArray(rounds) || rounds.length !== mode.meta.roundsPerDay)
        throw new Error(`${where}: needs exactly ${mode.meta.roundsPerDay} rounds`)
      out.set(
        `${mode.meta.id}/${day}`,
        rounds.map((r, i) => {
          try {
            return mode.parse(r)
          } catch (e) {
            throw new Error(`${where} round ${i + 1}: ${(e as Error).message}`)
          }
        }),
      )
    }
  }
  return out
}
