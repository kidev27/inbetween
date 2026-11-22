import { expect, it } from 'vitest'
import { layout } from '../src/client/modes/inbetween/line.ts'
import type { Answered } from '../src/shared/modes/inbetween.ts'

const base: Answered = {
  index: 0, category: 'weight', title: 'T', question: 'Q', unit: 'kg', scale: 'log',
  lo: { name: 'Cat', value: 4 }, hi: { name: 'Horse', value: 500 }, outcome: 'hit', points: 70,
  answer: { name: 'Capybara', value: 50, tier: 'yardstick' }, words: ['heavy', 'light'],
  common: { name: 'Dog', value: 30 }, rarest: { name: 'Okapi', value: 250 }, source: 'S',
}

it('puts the limits at the ends and the answer in between on a log scale', () => {
  const l = layout(base)
  expect(l.zone).toEqual([0, 100])
  expect(l.you?.x).toBeCloseTo((Math.log(50 / 4) / Math.log(125)) * 100)
  expect(l.beyond).toBeNull()
  expect(l.pins.map((p) => p.align)).toEqual(['al', 'ar', ''])
})

it('stretches the line to an out-of-range answer and marks the overshoot', () => {
  const hi = layout({ ...base, outcome: 'out', side: 'hi', points: 0, answer: { name: 'Elephant', value: 6000 } })
  expect(hi.you).toMatchObject({ x: 100, from: 0 })
  expect(hi.beyond?.[1]).toBe(100)
  const lo = layout({ ...base, outcome: 'out', side: 'lo', points: 0, answer: { name: 'Mouse', value: 0.02 } })
  expect(lo.you).toMatchObject({ x: 0, from: 100 })
  expect(lo.beyond?.[0]).toBe(0)
})

it('drops the common pin when it is the answer, and stacks labels that would overlap', () => {
  expect(layout({ ...base, answer: { name: 'Dog', value: 30, tier: 'pin' } }).pins).toHaveLength(2)
  const crowded = layout({ ...base, unit: 'year', scale: 'linear', lo: { name: 'Telephone', value: 1876 }, hi: { name: 'Television', value: 1927 }, common: { name: 'Light bulb', value: 1879 }, answer: undefined, outcome: 'time', points: 0 }, 300)
  const rows = crowded.pins.map((p) => p.row)
  expect(new Set(rows).size).toBeGreaterThan(1)
})
