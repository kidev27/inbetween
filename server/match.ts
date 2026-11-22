// Answer matching, from Blinker: exact over names and aliases, then a guarded typo fallback over
// canonical names only, so a typo can never land on an alias of a different answer.

export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
}

/** Normalized key that also ignores spaces and a trailing plural "s": "Light bulbs" = "lightbulb". */
export const key = (s: string) => normalize(s).replace(/ /g, '').replace(/(.{4,})s$/, '$1')

export interface AnswerIndex<A> {
  answers: A[]
  exact: Map<string, number>
  canonical: { key: string; i: number }[]
}

/**
 * Throws if two different answers share a name or alias. Answers with `fuzzy: false` match only
 * exactly: with thousands of obscure names, typo matching would land on surprising answers.
 */
export function buildIndex<A extends { name: string; aliases: string[]; fuzzy?: boolean }>(answers: A[]): AnswerIndex<A> {
  const exact = new Map<string, number>()
  answers.forEach((a, i) => {
    for (const raw of [a.name, ...a.aliases]) {
      const k = key(raw)
      if (!k) throw new Error(`empty name or alias on "${a.name}"`)
      const prev = exact.get(k)
      if (prev !== undefined && prev !== i) throw new Error(`"${raw}" matches both "${answers[prev].name}" and "${a.name}"`)
      exact.set(k, i)
    }
  })
  const canonical = answers.flatMap((a, i) => (a.fuzzy === false ? [] : [{ key: key(a.name), i }]))
  return { answers, exact, canonical }
}

/** Typo allowance by input length: none under 5 chars, 1 up to 8, 2 from 9. */
const allowance = (len: number) => (len >= 9 ? 2 : len >= 5 ? 1 : 0)

/** Returns the matched answer's index, or null. Equally close typo candidates count as no match. */
export function match<A>(index: AnswerIndex<A>, input: string): number | null {
  const k = key(input)
  if (!k) return null
  const hit = index.exact.get(k)
  if (hit !== undefined) return hit
  const max = allowance(k.length)
  if (!max) return null
  let best: number | null = null
  let bestD = max + 1
  let tie = false
  for (const c of index.canonical) {
    if (Math.abs(c.key.length - k.length) > max) continue
    const d = distance(k, c.key, max)
    if (d < bestD) [best, bestD, tie] = [c.i, d, false]
    else if (d === bestD && c.i !== best) tie = true
  }
  return tie ? null : best
}

/** Optimal-string-alignment distance (Levenshtein plus adjacent swaps). Returns max+1 once exceeded. */
export function distance(a: string, b: string, max: number): number {
  let prev2: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur.push(v)
      rowMin = Math.min(rowMin, v)
    }
    if (rowMin > max) return max + 1
    ;[prev2, prev] = [prev, cur]
  }
  return Math.min(prev[b.length], max + 1)
}
