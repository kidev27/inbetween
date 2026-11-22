// In Between: seven prompts a day. Each names two limits; name one thing that fits between them.
// Rarer answers pull out more tape. Every point is one centimetre, so a perfect day measures 7 m.
import type { ModeMeta } from '../mode.ts'

export const PROMPTS = 7
export const TIME_MS = 20_000
/** Network latency allowance on the server-side deadline. */
export const GRACE_MS = 2_000
/** An answer this close outside a limit still counts as a close call (5% of the value, or of the range on a linear scale). */
export const CLOSE = 0.05
export const CLOSE_POINTS = 10
export const MAX_ANSWER_LENGTH = 60

export const meta: ModeMeta = {
  id: 'inbetween',
  title: 'In Between',
  tagline: 'Seven pairs of limits. Name one thing that fits between them. The rarer your pick, the more tape you pull.',
  roundsPerDay: 1,
  scoreUnit: ' cm',
}

/** Tiers are measuring things that get bigger as answers get rarer. */
export const TIERS = {
  pin: { points: 10, name: 'Pin', desc: 'Common pick', bar: '▂' },
  ruler: { points: 40, name: 'Ruler', desc: 'Good pick', bar: '▄' },
  yardstick: { points: 70, name: 'Yardstick', desc: 'Rare pick', bar: '▆' },
  milestone: { points: 100, name: 'Milestone', desc: 'One in a mile', bar: '█' },
} as const
export type Tier = keyof typeof TIERS
export const isTier = (t: unknown): t is Tier => typeof t === 'string' && t in TIERS

/** Each category has its own icon on the client. */
export const CATEGORIES = ['speed', 'weight', 'landmark', 'population', 'year', 'alpha', 'mountain'] as const
export type Category = (typeof CATEGORIES)[number]

/** "alpha" places words in alphabetical order; "year" prints plain years; anything else prints after the number. */
export type Unit = string
export type Scale = 'log' | 'linear'

export interface Limit {
  name: string
  value: number
}

/** Public part of a prompt: everything needed to ask it, nothing about the answers. */
export interface Ask {
  index: number
  category: Category
  title: string
  question: string
  unit: Unit
  scale: Scale
  lo: Limit
  hi: Limit
}

export type Outcome = 'hit' | 'close' | 'out' | 'unknown' | 'time'

/** One answered prompt, with everything the reveal shows. Sent only once the prompt is answered. */
export interface Answered extends Ask {
  outcome: Outcome
  points: number
  /** The matched answer, if any. */
  answer?: { name: string; value: number; tier?: Tier; fact?: string }
  /** What the player typed when it matched nothing. */
  text?: string
  /** Which limit an out-of-range answer passed. */
  side?: 'lo' | 'hi'
  /** Words for "too ___": [above hi, below lo], e.g. ["tall", "short"]. */
  words: [string, string]
  common: Limit
  rarest: Limit & { fact?: string }
  source: string
}

export type InBetweenEvent =
  | { type: 'begin'; prompt: number }
  | { type: 'answer'; prompt: number; text: string }
  | { type: 'timeout'; prompt: number }

export interface InBetweenView {
  total: number
  points: number
  /** The next prompt, or null when the day is done. `msLeft` is null until its clock starts. */
  current: (Ask & { msLeft: number | null; note: 'limit' | 'unknown' | 'correction' | null; correction: string | null }) | null
  answered: Answered[]
}

/** Alphabetical position of a word as a number in [0, 1), so words can sit on a number line. */
export function alphaKey(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  let k = 0
  for (let i = 0; i < 6; i++) {
    const c = w.charCodeAt(i)
    k += (c >= 97 && c <= 122 ? c - 96 : 0) / 27 ** (i + 1)
  }
  return k
}

/** Display text for a value. Words show themselves, so the caller passes the name for "alpha". */
export function formatValue(value: number, unit: Unit, name = ''): string {
  if (unit === 'alpha') return name
  if (unit === 'year') return String(Math.round(value))
  if (unit === 'million') return `${value.toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 1 : 0 })} million`
  const n = value < 1 ? Number(value.toPrecision(2)) : value < 10 ? Number(value.toFixed(1)) : Math.round(value)
  return `${n.toLocaleString('en-US')} ${unit}`
}

/** Total in metres, e.g. 430 -> "4.30". */
export const metres = (cm: number) => (cm / 100).toFixed(2)
