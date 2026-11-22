import {
  alphaKey, CATEGORIES, CLOSE, CLOSE_POINTS, GRACE_MS, isTier, MAX_ANSWER_LENGTH, meta, PROMPTS, TIERS, TIME_MS,
  type Answered, type Ask, type Category, type InBetweenEvent, type InBetweenView, type Outcome, type Scale, type Tier,
} from '../../src/shared/modes/inbetween.ts'
import { fileURLToPath } from 'node:url'
import { loadCatalogs, type CatalogEntry, type Catalogs } from '../catalogs.ts'
import { buildIndex, key, match, type AnswerIndex } from '../match.ts'
import type { ServerMode } from '../mode.ts'

interface Answer {
  name: string
  aliases: string[]
  value: number
  tier?: Tier
  fact?: string
  fuzzy?: boolean
}

/**
 * Catalog answers get tiers from fame: how many Wikipedias have an article on them. Absolute, not
 * a rank, so a catalog of 20,000 mountains doesn't make its 2,000th best known a common pick.
 */
export const FAME_TIERS: [number, Tier][] = [[150, 'pin'], [60, 'ruler'], [20, 'yardstick'], [0, 'milestone']]
/** Catalog answers this well known (Wikipedias with an article) also match with a small typo. */
export const FUZZY_FAME = 20

interface Prompt {
  category: Category
  title: string
  question: string
  unit: string
  scale: Scale
  words: [string, string]
  lo: { name: string; value: number; key: string }
  hi: { name: string; value: number; key: string }
  common: number
  rarest: number
  source: string
  index: AnswerIndex<Answer>
}

interface Puzzle {
  prompts: Prompt[]
}

interface Rec {
  outcome: Outcome
  points: number
  /** Index of the matched answer. */
  i?: number
  /** Kept on hits so the summary can draw the share bars without the puzzle. */
  tier?: Tier
  text?: string
  side?: 'lo' | 'hi'
}

interface State {
  recs: Rec[]
  /** Deadline of the current prompt; null until the player begins it. */
  deadline: number | null
  /** The one free retry for an answer that is not on the list has been used. */
  retried: boolean
  note: 'limit' | 'unknown' | null
}

const text = (v: unknown, what: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`missing ${what}`)
  return v
}

const inRange = (p: { lo: { value: number }; hi: { value: number } }, v: number) => v > p.lo.value && v < p.hi.value

/** Hit, close call or out of range for a matched answer. */
function judge(p: Prompt, i: number): Rec {
  const a = p.index.answers[i]
  const v = a.value
  if (inRange(p, v)) return { outcome: 'hit', i, tier: a.tier, points: TIERS[a.tier!].points }
  const side = v >= p.hi.value ? 'hi' : 'lo'
  if (p.unit !== 'alpha') {
    const close =
      p.scale === 'log'
        ? (side === 'hi' ? v / p.hi.value : p.lo.value / v) < 1 + CLOSE
        : Math.min(Math.abs(v - p.lo.value), Math.abs(v - p.hi.value)) < (p.hi.value - p.lo.value) * CLOSE
    if (close) return { outcome: 'close', i, points: CLOSE_POINTS, side }
  }
  return { outcome: 'out', i, points: 0, side }
}

function parsePrompt(raw: unknown, n: number, catalogs: Catalogs): Prompt {
  const r = raw as Record<string, any>
  const title = text(r?.title, `title of prompt ${n}`)
  const where = `"${title}"`
  const category = r.category as Category
  if (!CATEGORIES.includes(category)) throw new Error(`${where}: category must be one of ${CATEGORIES.join(', ')}`)
  const unit = text(r.unit, `${where} unit`)
  const scale = r.scale as Scale
  if (scale !== 'log' && scale !== 'linear') throw new Error(`${where}: scale must be "log" or "linear"`)
  const alpha = unit === 'alpha'
  const valueOf = (o: any, what: string) => {
    if (alpha) return alphaKey(text(o?.name, what))
    if (!Number.isFinite(o?.value)) throw new Error(`${where}: ${what} needs a numeric value`)
    if (scale === 'log' && o.value <= 0) throw new Error(`${where}: ${what} must be above 0 on a log scale`)
    return o.value as number
  }
  const limit = (o: any, what: string) => {
    const name = text(o?.name, `${where} ${what} name`)
    return { name, value: valueOf(o, what), key: key(name) }
  }
  const lo = limit(r.lo, 'lower limit')
  const hi = limit(r.hi, 'upper limit')
  if (!(lo.value < hi.value)) throw new Error(`${where}: the lower limit must be below the upper limit`)
  if (!Array.isArray(r.words) || r.words.length !== 2) throw new Error(`${where}: words needs two entries, e.g. ["tall", "short"]`)

  if (!Array.isArray(r.answers) || r.answers.length < 5) throw new Error(`${where}: needs at least 5 answers`)
  const answers: Answer[] = r.answers.map((a: any) => {
    const name = text(a?.name, `${where} answer name`)
    const value = valueOf(a, `"${name}"`)
    const inside = inRange({ lo, hi }, value)
    if (inside && !isTier(a.tier)) throw new Error(`${where}: "${name}" is in range, so it needs a tier`)
    if (!inside && a.tier !== undefined) throw new Error(`${where}: "${name}" is out of range, so it must not have a tier`)
    if (a.aliases !== undefined && !Array.isArray(a.aliases)) throw new Error(`${where}: "${name}" aliases must be a list`)
    if ([name, ...(a.aliases ?? [])].some((s: string) => key(s) === lo.key || key(s) === hi.key))
      throw new Error(`${where}: "${name}" clashes with a limit's name`)
    return { name, aliases: a.aliases ?? [], value, tier: a.tier, fact: a.fact || undefined }
  })
  buildIndex(answers) // hand-written answers must not clash with each other
  let source = text(r.source, `${where} source`)
  if (r.catalog !== undefined) {
    const cat = catalogs.get(r.catalog)
    if (!cat) throw new Error(`${where}: no catalog "${r.catalog}"`)
    if (!alpha && cat.unit !== unit) throw new Error(`${where}: catalog "${r.catalog}" is in ${cat.unit}, the prompt in ${unit}`)
    answers.push(...fromCatalog(cat.entries, answers, { lo, hi, alpha, scale }))
    source += '. More answers from Wikidata.'
  }
  const index = buildIndex(answers)
  const find = (name: unknown, what: string) => {
    const i = answers.findIndex((a) => a.name === name)
    if (i < 0 || !answers[i].tier) throw new Error(`${where}: ${what} must name an in-range answer`)
    return i
  }
  const common = find(r.common, 'common')
  const rarest = find(r.rarest, 'rarest')
  if (answers[rarest].tier !== 'milestone') throw new Error(`${where}: rarest must be a milestone answer`)

  return {
    category, title, unit, scale, lo, hi, common, rarest, index,
    question: text(r.question, `${where} question`),
    words: [text(r.words[0], `${where} words`), text(r.words[1], `${where} words`)],
    source,
  }
}

/**
 * Catalog entries to add under the hand-written answers. An entry sharing any name or alias with
 * a hand answer or a limit is the same thing and is skipped; an alias clashing with an earlier
 * (better known) entry is dropped. In-range entries are tiered by fame rank.
 */
function fromCatalog(
  entries: CatalogEntry[], hand: Answer[],
  p: { lo: { value: number; key: string }; hi: { value: number; key: string }; alpha: boolean; scale: Scale },
): Answer[] {
  const same = new Set([p.lo.key, p.hi.key, ...hand.flatMap((a) => [a.name, ...a.aliases].map(key))])
  const taken = new Set(same)
  const out: (Answer & { fame: number })[] = []
  for (const [name, raw, fame, aliases] of entries) {
    const k = key(name)
    if (!k || taken.has(k) || aliases.some((s) => same.has(key(s)))) continue
    const value = p.alpha ? alphaKey(name) : raw
    if (!Number.isFinite(value) || (p.scale === 'log' && value <= 0)) continue
    const own = [...new Set(aliases.map(key))].filter((a) => a && a !== k && !taken.has(a))
    ;[k, ...own].forEach((x) => taken.add(x))
    out.push({ name, aliases: own, value, fame, fuzzy: fame >= FUZZY_FAME })
  }
  for (const a of out) if (inRange(p, a.value)) a.tier = FAME_TIERS.find(([min]) => a.fame >= min)![1]
  return out.map(({ fame: _f, ...a }) => a)
}

/**
 * Content format: { prompts: [7 x prompt] }. A prompt is
 * { category, title, question, unit, scale, words, lo, hi, common, rarest, source, answers: [answer] },
 * limit = { name, value }, answer = { name, value, tier?, aliases?, fact? }. In-range answers need a
 * tier; out-of-range ones (listed so they get a proper "too tall" reveal) must not have one.
 * With unit "alpha" values come from the names. Validated at boot, so bad content stops the server.
 */
const parse = (catalogs: Catalogs) => (raw: unknown): Puzzle => {
  const prompts = (raw as { prompts?: unknown })?.prompts
  if (!Array.isArray(prompts) || prompts.length !== PROMPTS) throw new Error(`needs exactly ${PROMPTS} prompts`)
  return { prompts: prompts.map((p, i) => parsePrompt(p, i + 1, catalogs)) }
}

const ask = (p: Prompt, index: number): Ask => ({
  index,
  category: p.category,
  title: p.title,
  question: p.question,
  unit: p.unit,
  scale: p.scale,
  lo: { name: p.lo.name, value: p.lo.value },
  hi: { name: p.hi.name, value: p.hi.value },
})

function answered(p: Prompt, index: number, r: Rec): Answered {
  const a = r.i === undefined ? undefined : p.index.answers[r.i]
  const common = p.index.answers[p.common]
  const rarest = p.index.answers[p.rarest]
  return {
    ...ask(p, index),
    outcome: r.outcome,
    points: r.points,
    ...(a && { answer: { name: a.name, value: a.value, tier: a.tier, fact: a.fact } }),
    ...(r.text !== undefined && { text: r.text }),
    ...(r.side && { side: r.side }),
    words: p.words,
    common: { name: common.name, value: common.value },
    rarest: { name: rarest.name, value: rarest.value, fact: rarest.fact },
    source: p.source,
  }
}

const record = (s: State, r: Rec): State => ({ recs: [...s.recs, r], deadline: null, retried: false, note: null })

function apply(s: State, e: InBetweenEvent, p: Puzzle, now: number): State {
  const i = s.recs.length
  // Only the current prompt takes events, so double taps and stale requests are no-ops.
  if (e.prompt !== i || i >= PROMPTS) return s
  const q = p.prompts[i]
  if (e.type === 'begin') return s.deadline === null ? { ...s, deadline: now + TIME_MS, retried: false, note: null } : s
  if (s.deadline === null) return s
  if (e.type === 'timeout') return now >= s.deadline ? record(s, { outcome: 'time', points: 0 }) : s
  if (now > s.deadline + GRACE_MS) return record(s, { outcome: 'time', points: 0 })
  const k = key(e.text)
  if (k && (k === q.lo.key || k === q.hi.key)) return { ...s, note: 'limit' }
  const m = match(q.index, e.text)
  if (m !== null) return record(s, judge(q, m))
  if (!s.retried) return { ...s, retried: true, note: 'unknown' }
  return record(s, { outcome: 'unknown', points: 0, text: e.text.trim().slice(0, MAX_ANSWER_LENGTH) })
}

const total = (s: State) => s.recs.reduce((n, r) => n + r.points, 0)

/** The mode with a given set of catalogs (tests pass their own). */
export const makeInbetween = (catalogs: Catalogs): ServerMode<Puzzle, State, InBetweenEvent, InBetweenView> => ({
  meta,
  eventSchema: {
    type: 'object',
    required: ['type', 'prompt'],
    additionalProperties: false,
    properties: {
      type: { enum: ['begin', 'answer', 'timeout'] },
      prompt: { type: 'integer', minimum: 0, maximum: PROMPTS - 1 },
      text: { type: 'string', minLength: 1, maxLength: MAX_ANSWER_LENGTH },
    },
    if: { properties: { type: { const: 'answer' } } },
    then: { required: ['text'] },
  },
  parse: parse(catalogs),
  prompt: () => `${PROMPTS} prompts`,
  start: () => ({ recs: [], deadline: null, retried: false, note: null }),
  apply,
  view: (s, now, p) => {
    const i = s.recs.length
    const q = p.prompts[i]
    return {
      total: PROMPTS,
      points: total(s),
      current: q ? { ...ask(q, i), msLeft: s.deadline === null ? null : Math.max(0, s.deadline - now), note: s.note } : null,
      answered: s.recs.map((r, j) => answered(p.prompts[j], j, r)),
    }
  },
  summary: (s) => {
    if (s.recs.length < PROMPTS) return null
    const bar = (r: Rec) => (r.tier ? TIERS[r.tier].bar : r.outcome === 'close' ? TIERS.pin.bar : '·')
    return { score: total(s), outcome: 'finished', glyph: s.recs.map(bar).join('') }
  },
})

export const inbetween = makeInbetween(loadCatalogs(fileURLToPath(new URL('../../content/catalogs', import.meta.url))))
