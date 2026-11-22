import { expect, it } from 'vitest'
import { addDays, dayNumber, isDayKey, isPlayableDay } from '../src/shared/day.ts'

it('validates day keys strictly', () => {
  expect(isDayKey('2026-11-21')).toBe(true)
  expect(isDayKey('2026-02-30')).toBe(false)
  expect(isDayKey('2026-1-1')).toBe(false)
})

it('allows only days within one day of UTC today', () => {
  const now = Date.parse('2026-11-21T23:00:00Z')
  expect(isPlayableDay('2026-11-22', now)).toBe(true) // already tomorrow in UTC+14
  expect(isPlayableDay('2026-11-20', now)).toBe(true)
  expect(isPlayableDay('2026-11-23', now)).toBe(false)
})

it('numbers puzzles from launch day', () => {
  expect(dayNumber('2026-11-22')).toBe(1)
  expect(dayNumber(addDays('2026-11-22', 30))).toBe(31)
})
