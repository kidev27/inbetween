// A "day" is a YYYY-MM-DD key in the player's local calendar, Wordle-style.
export const LAUNCH_DAY = '2026-11-22'
const DAY_MS = 86_400_000

const utcMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
const pad = (n: number) => String(n).padStart(2, '0')

export function isDayKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const t = utcMs(s)
  return !Number.isNaN(t) && new Date(t).toISOString().startsWith(s)
}

export const localDayKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const addDays = (day: string, n: number) =>
  new Date(utcMs(day) + n * DAY_MS).toISOString().slice(0, 10)

/** Puzzle number shown to players: launch day is #1. */
export const dayNumber = (day: string) => Math.round((utcMs(day) - utcMs(LAUNCH_DAY)) / DAY_MS) + 1

/** Local dates span UTC-12..UTC+14, so a valid local day is within one day of the UTC date. */
export function isPlayableDay(day: string, now = Date.now()): boolean {
  if (!isDayKey(day)) return false
  const today = new Date(now).toISOString().slice(0, 10)
  return Math.abs(utcMs(day) - utcMs(today)) <= DAY_MS
}
