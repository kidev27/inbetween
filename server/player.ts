import { randomUUID } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Db } from './db.ts'

const COOKIE = 'inbetween_pid'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The only code that knows how a request maps to a player. Everything else sees a player id.
 * Accounts later: look up a session here first, fall back to the guest cookie, and link the
 * account to the guest's existing player id so history carries over.
 * shortcut: guests live only in a cookie, so clearing cookies loses progress; fixed by accounts.
 */
export function players(db: Db, secureCookies: boolean) {
  const exists = db.prepare('SELECT 1 FROM players WHERE id = ?')
  const insert = db.prepare('INSERT INTO players (id, created_at) VALUES (?, ?)')

  return {
    getPlayer(req: FastifyRequest, reply: FastifyReply): string {
      const id = req.cookies[COOKIE]
      if (id && UUID.test(id) && exists.get(id)) return id
      const fresh = randomUUID()
      insert.run(fresh, Date.now())
      reply.setCookie(COOKIE, fresh, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: secureCookies,
        maxAge: 400 * 86_400,
      })
      return fresh
    },
    /** Rate-limit key: the player when known, else the IP. */
    rateKey: (req: FastifyRequest) => req.cookies[COOKIE] ?? req.ip,
  }
}
