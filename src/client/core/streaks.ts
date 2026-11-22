import { addDays } from '../../shared/day.ts'
import { load, save } from './storage.ts'

/** Day key to that day's total score, per mode, kept on this device. */
export type History = Record<string, number>

export interface Stats {
  played: number
  /** Consecutive days ending today or yesterday; 0 once a day is missed. */
  streak: number
  bestStreak: number
  /** Highest daily total. */
  bestDay: number
}

const key = (modeId: string) => `inbetween:history:${modeId}`

export const getHistory = (modeId: string) => load<History>(key(modeId), {})

export function recordResult(modeId: string, day: string, total: number): History {
  const h = { ...getHistory(modeId), [day]: total }
  save(key(modeId), h)
  return h
}

export function stats(h: History, today: string): Stats {
  const days = Object.keys(h).sort()
  let run = 0
  let bestStreak = 0
  days.forEach((d, i) => {
    run = i > 0 && addDays(days[i - 1], 1) === d ? run + 1 : 1
    bestStreak = Math.max(bestStreak, run)
  })
  const last = days.at(-1)
  const alive = last === today || (last !== undefined && addDays(last, 1) === today)
  return {
    played: days.length,
    streak: alive ? run : 0,
    bestStreak,
    bestDay: Math.max(0, ...Object.values(h)),
  }
}
