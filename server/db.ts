import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

// Built into Node, so no native module to download or compile on any OS.
export type Db = DatabaseSync

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))

export const userVersion = (db: Db) => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version

/** Opens the database and applies pending migrations/NNNN_*.sql in order, tracked by PRAGMA user_version. */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  const applied = userVersion(db)
  files.slice(applied).forEach((f, i) => {
    db.exec('BEGIN')
    try {
      db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
      db.exec(`PRAGMA user_version = ${applied + i + 1}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  })
  return db
}
