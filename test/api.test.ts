import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../server/app.ts'
import { openDb, userVersion, type Db } from '../server/db.ts'
import type { ServerMode } from '../server/mode.ts'
import { inbetween } from '../server/modes/inbetween.ts'
import { testPuzzle } from './helpers.ts'

// A second mode that core code knows nothing about: proves modes plug in without core changes.
const coin: ServerMode<{ q: string }, { flips: number }, { type: 'flip' }, { flips: number }> = {
  meta: { id: 'coin', title: 'Coin', tagline: '', roundsPerDay: 1, scoreUnit: 'pts' },
  eventSchema: { type: 'object', required: ['type'], properties: { type: { const: 'flip' } } },
  parse: (r) => r as { q: string },
  prompt: (p) => p.q,
  start: () => ({ flips: 0 }),
  apply: (s) => ({ flips: s.flips + 1 }),
  view: (s) => s,
  summary: (s) => (s.flips ? { score: 7, outcome: 'flipped', glyph: '🪙' } : null),
}

const DAY = '2026-11-22'
const BASE = `/api/inbetween/${DAY}`
let t: number
let db: Db
let app: Awaited<ReturnType<typeof buildApp>>

beforeEach(async () => {
  t = Date.parse(`${DAY}T12:00:00Z`)
  db = openDb(':memory:')
  app = await buildApp({
    db,
    modes: [inbetween, coin],
    puzzles: new Map<string, unknown[]>([
      [`inbetween/${DAY}`, [inbetween.parse(testPuzzle())]],
      [`coin/${DAY}`, [{ q: 'Heads?' }]],
    ]),
    now: () => t,
  })
})

const cookieOf = (res: { cookies: { name: string; value: string }[] }) =>
  res.cookies.find((c) => c.name === 'inbetween_pid')?.value
const players = () => (db.prepare('SELECT count(*) n FROM players').get() as { n: number }).n

/** A client holding a cookie jar. */
async function client() {
  const first = await app.inject({ url: BASE })
  const pid = cookieOf(first)!
  const req = (method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, payload, cookies: { inbetween_pid: pid } })
  return { pid, req, first }
}

describe('guest players', () => {
  it('creates one guest per cookie and reuses it', async () => {
    const { req, first } = await client()
    expect(first.statusCode).toBe(200)
    expect(cookieOf(await req('GET', BASE))).toBeUndefined()
    expect(players()).toBe(1)
  })

  it('replaces unknown or malformed cookies with a fresh guest', async () => {
    for (const bad of ['garbage', '00000000-0000-4000-8000-000000000000']) {
      const res = await app.inject({ url: BASE, cookies: { inbetween_pid: bad } })
      expect(res.statusCode).toBe(200)
      expect(cookieOf(res)).toMatch(/^[0-9a-f-]{36}$/)
    }
    expect(players()).toBe(2)
  })

  it('sets a hardened cookie', async () => {
    const res = await app.inject({ url: BASE })
    expect(res.headers['set-cookie']).toMatch(/HttpOnly/)
    expect(res.headers['set-cookie']).toMatch(/SameSite=Lax/)
  })
})

describe('inbetween API', () => {
  const ev = `${BASE}/0/event`

  it('hides the prompts until the day is started', async () => {
    const { req, first } = await client()
    expect(first.json()).toMatchObject({ number: 1, rounds: [{ prompt: null, view: null }] })
    const start = await req('POST', `${BASE}/0/start`)
    expect(start.json()).toMatchObject({ view: { points: 0, answered: [], current: { index: 0, msLeft: null } }, summary: null })
  })

  it('plays all seven prompts, records the score, and never sends answers early', async () => {
    const { req } = await client()
    let res = await req('POST', `${BASE}/0/start`)
    for (let i = 0; i < 7; i++) {
      res = await req('POST', ev, { type: 'begin', prompt: i })
      expect(res.json().view.current.msLeft).toBe(20_000)
      expect(JSON.stringify(res.json().view.current)).not.toMatch(/Gem|Middle|source/)
      res = await req('POST', ev, { type: 'answer', prompt: i, text: i === 3 ? 'Giant' : 'Gem' })
    }
    expect(res.json().summary).toMatchObject({ score: 600, outcome: 'finished', glyph: '███·███' })
    expect(db.prepare('SELECT status, score FROM runs').get()).toEqual({ status: 'finished', score: 600 })
  })

  it('keeps the clock running across a reload', async () => {
    const { req } = await client()
    await req('POST', `${BASE}/0/start`)
    await req('POST', ev, { type: 'begin', prompt: 0 })
    t += 8000
    expect((await req('POST', `${BASE}/0/start`)).json().view.current.msLeft).toBe(12_000)
  })

  it('validates input', async () => {
    const { req } = await client()
    expect((await req('POST', ev, { type: 'begin', prompt: 0 })).statusCode).toBe(409)
    await req('POST', `${BASE}/0/start`)
    expect((await req('POST', ev, { type: 'answer', prompt: 0 })).statusCode).toBe(400)
    expect((await req('POST', ev, { type: 'answer', prompt: 0, text: '' })).statusCode).toBe(400)
    expect((await req('POST', ev, { type: 'answer', prompt: 0, text: 'x'.repeat(61) })).statusCode).toBe(400)
    expect((await req('POST', ev, { type: 'begin', prompt: 7 })).statusCode).toBe(400)
    expect((await req('POST', ev, { type: 'cheat', prompt: 0 })).statusCode).toBe(400)
    expect((await req('POST', `${BASE}/1/start`)).statusCode).toBe(404)
    expect((await req('GET', '/api/inbetween/2026-11-30')).statusCode).toBe(400)
    expect((await req('GET', '/api/inbetween/not-a-day')).statusCode).toBe(400)
  })

  it('404s a playable day with no content', async () => {
    t = Date.parse('2026-11-23T12:00:00Z')
    expect((await app.inject({ url: '/api/inbetween/2026-11-23' })).statusCode).toBe(404)
  })

  it('rate-limits event spam per player', async () => {
    const { req } = await client()
    await req('POST', `${BASE}/0/start`)
    const codes = []
    for (let i = 0; i < 22; i++) codes.push((await req('POST', ev, { type: 'begin', prompt: 6 })).statusCode)
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true)
    expect(codes.at(-1)).toBe(429)
  })
})

describe('extensibility', () => {
  it('serves a mode the core has never heard of', async () => {
    const { req } = await client()
    const modes = (await app.inject({ url: '/api/modes' })).json().map((m: { id: string }) => m.id)
    expect(modes).toEqual(['inbetween', 'coin'])
    expect((await req('POST', `/api/coin/${DAY}/0/start`)).json()).toMatchObject({ prompt: 'Heads?' })
    const res = await req('POST', `/api/coin/${DAY}/0/event`, { type: 'flip' })
    expect(res.json().summary).toEqual({ score: 7, outcome: 'flipped', glyph: '🪙' })
  })
})

describe('migrations', () => {
  it('records the applied version', () => {
    expect(userVersion(db)).toBe(1)
  })
})
