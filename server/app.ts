import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyRequest } from 'fastify'
import { dayNumber, isPlayableDay } from '../src/shared/day.ts'
import type { Puzzles } from './content.ts'
import type { Db } from './db.ts'
import type { ServerMode } from './mode.ts'
import { players } from './player.ts'

export interface AppOptions {
  db: Db
  modes: ServerMode[]
  puzzles: Puzzles
  now?: () => number
  /** Built client to serve (production). Omitted in dev, where Vite serves it. */
  clientDir?: string
  secureCookies?: boolean
  logger?: boolean
}

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode })

type DayReq = FastifyRequest<{ Params: { day: string; slot?: number } }>

export async function buildApp(o: AppOptions) {
  const now = o.now ?? Date.now
  const app = Fastify({ logger: o.logger ?? false })
  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  const { getPlayer, rateKey } = players(o.db, o.secureCookies ?? false)

  const q = {
    get: o.db.prepare('SELECT state FROM runs WHERE player_id = ? AND mode = ? AND day = ? AND slot = ?'),
    insert: o.db.prepare(
      'INSERT INTO runs (player_id, mode, day, slot, state, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
    update: o.db.prepare(
      'UPDATE runs SET state = ?, status = ?, score = ?, ended_at = ? WHERE player_id = ? AND mode = ? AND day = ? AND slot = ?',
    ),
  }

  app.get('/api/modes', () => o.modes.map((m) => m.meta))

  for (const mode of o.modes) {
    const id = mode.meta.id
    const base = `/api/${id}/:day`
    const slotParams = {
      type: 'object',
      properties: { day: { type: 'string' }, slot: { type: 'integer', minimum: 0 } },
    }

    const roundsFor = (day: string) => {
      if (!isPlayableDay(day, now())) throw httpError(400, 'That day is not playable.')
      const rounds = o.puzzles.get(`${id}/${day}`)
      if (!rounds) throw httpError(404, 'No puzzle scheduled for today.')
      return rounds
    }
    const load = (player: string, day: string, slot: number) => {
      const row = q.get.get(player, id, day, slot) as { state: string } | undefined
      return row && JSON.parse(row.state)
    }
    const out = (puzzle: unknown, state: unknown) => ({
      prompt: mode.prompt(puzzle),
      view: mode.view(state, now(), puzzle),
      summary: mode.summary(state),
    })

    app.get(base, (req: DayReq, reply) => {
      const { day } = req.params
      const rounds = roundsFor(day)
      const player = getPlayer(req, reply)
      return {
        day,
        number: dayNumber(day),
        rounds: rounds.map((p, slot) => {
          const s = load(player, day, slot)
          return { slot, ...(s ? out(p, s) : { prompt: null, view: null, summary: null }) }
        }),
      }
    })

    app.post(`${base}/:slot/start`, { schema: { params: slotParams } }, (req: DayReq, reply) => {
      const { day, slot = 0 } = req.params
      const puzzle = roundsFor(day)[slot]
      if (!puzzle) throw httpError(404, 'No such round.')
      const player = getPlayer(req, reply)
      let s = load(player, day, slot)
      if (!s) {
        s = mode.start(puzzle, now())
        q.insert.run(player, id, day, slot, JSON.stringify(s), 'playing', now())
      }
      return out(puzzle, s)
    })

    app.post(
      `${base}/:slot/event`,
      {
        schema: { params: slotParams, body: mode.eventSchema },
        config: { rateLimit: { max: 20, timeWindow: 10_000, keyGenerator: rateKey } },
      },
      (req: DayReq, reply) => {
        const { day, slot = 0 } = req.params
        const puzzle = roundsFor(day)[slot]
        if (!puzzle) throw httpError(404, 'No such round.')
        const player = getPlayer(req, reply)
        const s = load(player, day, slot)
        if (!s) throw httpError(409, 'Start the round first.')
        const t = now()
        const next = mode.apply(s, req.body, puzzle, t)
        if (next !== s) {
          const summary = mode.summary(next)
          q.update.run(JSON.stringify(next), summary?.outcome ?? 'playing', summary?.score ?? null, summary ? t : null, player, id, day, slot)
        }
        return out(puzzle, next)
      },
    )
  }

  if (o.clientDir) {
    await app.register(fastifyStatic, {
      root: o.clientDir,
      setHeaders: (res, path) =>
        res.header('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'),
    })
  }
  return app
}
