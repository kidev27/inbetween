import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** One catalog entry: name, value (0 for word lists), fame (Wikipedias with an article), aliases. */
export type CatalogEntry = [name: string, value: number, fame: number, aliases: string[]]

export interface Catalog {
  id: string
  unit: string
  source: string
  /** Best known first. */
  entries: CatalogEntry[]
}

export type Catalogs = Map<string, Catalog>

/** Loads content/catalogs/*.json, built from Wikidata by scripts/catalogs.ts. */
export function loadCatalogs(dir: string): Catalogs {
  const out: Catalogs = new Map()
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const c = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Catalog
    if (!c.id || !Array.isArray(c.entries)) throw new Error(`catalogs/${f}: not a catalog`)
    out.set(c.id, c)
  }
  return out
}
