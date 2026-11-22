import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildApp } from './app.ts'
import { loadContent } from './content.ts'
import { openDb } from './db.ts'
import { serverModes } from './modes/registry.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const prod = process.env.NODE_ENV === 'production'

const app = await buildApp({
  db: openDb(process.env.DB_PATH ?? join(root, 'data/inbetween.db')),
  modes: serverModes,
  puzzles: loadContent(join(root, 'content'), serverModes),
  clientDir: prod ? join(root, 'dist') : undefined,
  // Secure cookies need HTTPS in production (Caddy). Browsers also accept them on http://localhost.
  secureCookies: prod,
  logger: true,
})
// 8789 by default so it can share a machine with Blinker (8787) and HIGH▲LOW▼ (8788).
await app.listen({ port: Number(process.env.PORT ?? 8789), host: process.env.HOST ?? '127.0.0.1' })
