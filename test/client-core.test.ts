import { expect, it } from 'vitest'
import { shareText } from '../src/client/core/share.ts'
import { stats } from '../src/client/core/streaks.ts'

it('counts streaks across gaps and keeps the best', () => {
  const h = { '2026-11-01': 100, '2026-11-02': 250, '2026-11-03': 80, '2026-11-05': 300, '2026-11-06': 10 }
  expect(stats(h, '2026-11-06')).toEqual({ played: 5, streak: 2, bestStreak: 3, bestDay: 300 })
  expect(stats(h, '2026-11-07')).toMatchObject({ streak: 2 }) // yesterday still counts
  expect(stats(h, '2026-11-08')).toMatchObject({ streak: 0, bestStreak: 3 })
})

it('handles an empty history', () => {
  expect(stats({}, '2026-11-21')).toEqual({ played: 0, streak: 0, bestStreak: 0, bestDay: 0 })
})

it('share text works for any mode and spoils nothing', () => {
  const meta = { id: 'coin', title: 'Coin', tagline: '', roundsPerDay: 2, scoreUnit: '/10' }
  const text = shareText(meta, 12, [{ score: 5, outcome: 'won', glyph: '🟩🟥' }, { score: 2, outcome: 'won', glyph: '🟥' }], 'https://x.test')
  expect(text).toBe('Coin #12\n🟩🟥\n🟥\n7/10\nhttps://x.test')
})
