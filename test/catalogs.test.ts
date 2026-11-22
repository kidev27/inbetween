import { expect, it } from 'vitest'
import type { Catalogs } from '../server/catalogs.ts'
import { makeInbetween } from '../server/modes/inbetween.ts'
import { testPrompt } from './helpers.ts'

// Best known first, as the builder writes them.
const catalogs: Catalogs = new Map([['things', { id: 'things', unit: 'kg', source: 'test', entries: [
  ['Famous', 20, 200, ['celebrity']],
  ['Middle duplicate', 50, 80, ['mid']], // shares an alias with the hand answer "Middle": same thing, skipped
  ['High', 99, 70, []], // the upper limit's name: skipped
  ['Also known', 25, 40, ['famous']], // alias clashes with "Famous": alias dropped, entry kept
  ['Rare one', 70, 70, []],
  ['Obscure', 80, 5, []],
  ['Too big', 900, 60, []],
  ['Deep cut', 15, 2, []],
] }]])

const m = makeInbetween(catalogs)
const day = (extra: object) => ({ prompts: Array.from({ length: 7 }, () => ({ ...testPrompt(), ...extra })) })
const p = m.parse(day({ catalog: 'things' }))
const answer = (text: string) => {
  let s = m.apply(m.start(p, 0), { type: 'begin', prompt: 0 }, p, 0)
  s = m.apply(s, { type: 'answer', prompt: 0, text }, p, 0)
  s = m.apply(s, { type: 'answer', prompt: 0, text }, p, 0) // a second try if the first was unknown
  return m.view(s, 0, p).answered[0]
}

it('adds catalog answers under the hand-written ones, tiered by how well known they are', () => {
  expect(answer('Famous')).toMatchObject({ outcome: 'hit', answer: { tier: 'pin' } })
  expect(answer('Rare one')).toMatchObject({ outcome: 'hit', answer: { tier: 'ruler' } })
  expect(answer('Also known')).toMatchObject({ outcome: 'hit', answer: { tier: 'yardstick' } })
  expect(answer('Deep cut')).toMatchObject({ outcome: 'hit', answer: { tier: 'milestone' } })
  expect(answer('Too big')).toMatchObject({ outcome: 'out', side: 'hi' })
  expect(answer('mid')).toMatchObject({ answer: { name: 'Middle', tier: 'pin' } }) // the hand answer wins
  expect(answer('famous')).toMatchObject({ answer: { name: 'Famous' } })
  expect(answer('Middle duplicate').outcome).toBe('unknown')
})

it('matches typos only on well-known catalog names', () => {
  expect(answer('Faamous')).toMatchObject({ answer: { name: 'Famous' } })
  expect(answer('Obscur').outcome).toBe('unknown')
  expect(answer('Obscure')).toMatchObject({ outcome: 'hit' })
})

it('says where the extra answers came from', () => {
  expect(answer('Famous').source).toBe('Made up for tests. More answers from Wikidata.')
})

it('rejects a missing catalog or a unit mismatch', () => {
  expect(() => m.parse(day({ catalog: 'nope' }))).toThrow(/no catalog "nope"/)
  expect(() => m.parse(day({ catalog: 'things', unit: 'm' }))).toThrow(/catalog "things" is in kg/)
})
