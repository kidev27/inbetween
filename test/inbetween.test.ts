import { describe, expect, it } from 'vitest'
import { inbetween as m } from '../server/modes/inbetween.ts'
import { alphaKey, formatValue, GRACE_MS, TIME_MS, type InBetweenEvent } from '../src/shared/modes/inbetween.ts'
import { testPrompt, testPuzzle } from './helpers.ts'

const p = m.parse(testPuzzle())
const T0 = 1_000_000
type S = ReturnType<typeof m.start>
const run = (events: [InBetweenEvent, number?][]) => events.reduce((s, [e, t = T0]) => m.apply(s, e, p, t), m.start(p, T0))
const begin = (prompt: number): [InBetweenEvent] => [{ type: 'begin', prompt }]
const say = (prompt: number, text: string, t?: number): [InBetweenEvent, number?] => [{ type: 'answer', prompt, text }, t]
const last = (s: S) => m.view(s, T0, p).answered.at(-1)!

describe('parse', () => {
  const bad = (change: (raw: ReturnType<typeof testPrompt>) => void) => {
    const raw = testPuzzle()
    change(raw.prompts[2] as ReturnType<typeof testPrompt>)
    return () => m.parse(raw)
  }
  it('rejects bad content with a reason', () => {
    expect(() => m.parse({ prompts: testPuzzle().prompts.slice(1) })).toThrow(/exactly 7 prompts/)
    expect(bad((r) => delete (r.answers[0] as { tier?: string }).tier)).toThrow(/"Middle" is in range, so it needs a tier/)
    expect(bad((r) => Object.assign(r.answers[5], { tier: 'pin' }))).toThrow(/"Giant" is out of range/)
    expect(bad((r) => r.answers[1].name = 'Middle')).toThrow(/matches both/)
    expect(bad((r) => r.rarest = 'Ruler')).toThrow(/rarest must be a milestone/)
    expect(bad((r) => r.common = 'Giant')).toThrow(/common must name an in-range answer/)
    expect(bad((r) => r.hi.value = 5)).toThrow(/lower limit must be below/)
    expect(bad((r) => r.category = 'music')).toThrow(/category must be one of/)
    expect(bad((r) => r.answers[2].name = 'high')).toThrow(/clashes with a limit/)
    expect(bad((r) => r.source = '')).toThrow(/source/)
  })
})

describe('clock', () => {
  it('ignores answers before the prompt begins and for any other prompt', () => {
    const s = m.start(p, T0)
    expect(m.apply(s, say(0, 'Middle')[0], p, T0)).toBe(s)
    const b = run([begin(0)])
    expect(m.apply(b, say(1, 'Middle')[0], p, T0)).toBe(b)
    expect(m.apply(b, begin(0)[0], p, T0 + 5000)).toBe(b) // a second begin does not reset the clock
  })

  it('shows time left once begun', () => {
    expect(m.view(m.start(p, T0), T0, p).current?.msLeft).toBeNull()
    expect(m.view(run([begin(0)]), T0 + 5000, p).current?.msLeft).toBe(TIME_MS - 5000)
  })

  it('times out only after the deadline, and refuses late answers after the grace period', () => {
    const b = run([begin(0)])
    expect(m.apply(b, { type: 'timeout', prompt: 0 }, p, T0 + TIME_MS - 1)).toBe(b)
    expect(last(m.apply(b, { type: 'timeout', prompt: 0 }, p, T0 + TIME_MS))).toMatchObject({ outcome: 'time', points: 0 })
    expect(last(m.apply(b, say(0, 'Gem')[0], p, T0 + TIME_MS + GRACE_MS - 1))).toMatchObject({ outcome: 'hit', points: 100 })
    expect(last(m.apply(b, say(0, 'Gem')[0], p, T0 + TIME_MS + GRACE_MS + 1))).toMatchObject({ outcome: 'time' })
  })
})

describe('answers', () => {
  it('scores exact names and aliases by tier', () => {
    expect(last(run([begin(0), say(0, 'Middle')]))).toMatchObject({ outcome: 'hit', points: 10, answer: { name: 'Middle', tier: 'pin' } })
    expect(last(run([begin(0), say(0, 'the MID')]))).toMatchObject({ answer: { name: 'Middle' } })
    expect(last(run([begin(0), say(0, 'gem')]))).toMatchObject({ points: 100, answer: { fact: 'Gems are rare.' } })
  })

  it('fills in a typo or partial answer to confirm, and scores it once confirmed', () => {
    for (const typed of ['yardstik', 'Yards', 'yardsti']) {
      const s = run([begin(0), say(0, typed)])
      expect(s.recs).toEqual([])
      expect(m.view(s, T0, p).current).toMatchObject({ note: 'correction', correction: 'Yardstick' })
      expect(last(m.apply(s, say(0, 'Yardstick')[0], p, T0))).toMatchObject({ points: 70 })
    }
    expect(m.view(run([begin(0), say(0, 'Yar')]), T0, p).current?.note).toBe('unknown') // too short to complete
  })

  it('gives a close call just outside a limit, and 0 further out', () => {
    expect(last(run([begin(0), say(0, 'Edge')]))).toMatchObject({ outcome: 'close', points: 10, side: 'hi' })
    expect(last(run([begin(0), say(0, 'Giant')]))).toMatchObject({ outcome: 'out', points: 0, side: 'hi' })
    expect(last(run([begin(0), say(0, 'Speck')]))).toMatchObject({ outcome: 'out', side: 'lo' })
  })

  it('does not record a limit as an answer', () => {
    const s = run([begin(0), say(0, 'high')])
    expect(s.recs).toEqual([])
    expect(m.view(s, T0, p).current?.note).toBe('limit')
  })

  it('gives one retry for an answer that is not on the list', () => {
    const once = run([begin(0), say(0, 'Unicorn')])
    expect(once.recs).toEqual([])
    expect(m.view(once, T0, p).current?.note).toBe('unknown')
    expect(last(m.apply(once, say(0, 'Gem')[0], p, T0))).toMatchObject({ points: 100 })
    expect(last(m.apply(once, say(0, ' Unicorn ')[0], p, T0))).toMatchObject({ outcome: 'unknown', text: 'Unicorn', points: 0 })
  })
})

describe('view', () => {
  it('never sends answers for a prompt that is not answered yet', () => {
    const json = JSON.stringify(m.view(run([begin(0), say(0, 'Middle'), begin(1)]), T0, p))
    const next = JSON.stringify(m.view(run([begin(0), say(0, 'Middle'), begin(1)]), T0, p).current)
    expect(next).not.toMatch(/Gem|Ruler|Yardstick|Giant|Middle|fact|source/)
    expect(json).toContain('"rarest":{"name":"Gem"') // revealed for the answered prompt only
  })

  it('finishes after seven prompts with a bar per prompt', () => {
    const answers = ['Middle', 'Ruler', 'Yardstick', 'Gem', 'Edge', 'Giant', 'Middle']
    const s = run(answers.flatMap((a, i) => [begin(i), say(i, a)]))
    expect(m.view(s, T0, p)).toMatchObject({ current: null, points: 240 })
    expect(m.summary(s)).toEqual({ score: 240, outcome: 'finished', glyph: '▂▄▆█▂·▂' })
    expect(m.apply(s, begin(7)[0], p, T0)).toBe(s)
    expect(m.summary(run([begin(0), say(0, 'Gem')]))).toBeNull()
  })
})

describe('alphabet prompts', () => {
  const alpha = m.parse({
    prompts: Array.from({ length: 7 }, () => ({
      ...testPrompt(), category: 'alpha', unit: 'alpha', scale: 'linear', words: ['after orange', 'before kiwi'],
      lo: { name: 'Kiwi' }, hi: { name: 'Orange' }, common: 'Mango', rarest: 'Kumquat',
      answers: [{ name: 'Mango', tier: 'pin' }, { name: 'Lime', tier: 'ruler' }, { name: 'Melon', tier: 'yardstick' },
        { name: 'Kumquat', tier: 'milestone' }, { name: 'Apple' }],
    })),
  })
  it('orders words alphabetically', () => {
    expect(alphaKey('kiwi') < alphaKey('kumquat') && alphaKey('kumquat') < alphaKey('orange')).toBe(true)
    const s = [begin(0), say(0, 'apple')].reduce((st, [e]) => m.apply(st, e, alpha, T0), m.start(alpha, T0))
    expect(m.view(s, T0, alpha).answered[0]).toMatchObject({ outcome: 'out', side: 'lo' })
  })
})

it('formats values', () => {
  expect(formatValue(0.02, 'kg')).toBe('0.02 kg')
  expect(formatValue(6000, 'kg')).toBe('6,000 kg')
  expect(formatValue(212, 'million')).toBe('212 million')
  expect(formatValue(1876, 'year')).toBe('1876')
  expect(formatValue(0.3, 'alpha', 'Kiwi')).toBe('Kiwi')
})
