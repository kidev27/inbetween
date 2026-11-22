// Where everything sits on a reveal's number line, in % of the track. Pure, so it is unit-tested.
import { formatValue, type Answered } from '../../../shared/modes/inbetween.ts'

export type Align = '' | 'al' | 'ar'
export interface Pin {
  kind: 'lo' | 'hi' | 'common'
  x: number
  label: string
  align: Align
  /** Labels under the line stack into rows so they never overlap. */
  row: number
}
export interface Line {
  pins: Pin[]
  /** The in-range stretch between the two limits. */
  zone: [number, number]
  /** The player's answer: where its marker lands and where it starts sliding from. */
  you: { x: number; from: number; align: Align; label: (v: number) => string } | null
  /** The red stretch an out-of-range answer overshoots by. */
  beyond: [number, number] | null
  inv: (x: number) => number
}

/** Rough label widths in px for 13-14px Overpass bold. */
const pxWidth = (s: string, perChar: number, pad: number) => [...s].length * perChar + pad

/** Centre a label on its pin unless it would run off the track, then pin it to that edge. */
const alignFor = (x: number, w: number): Align => (x - w / 2 < 0 ? 'al' : x + w / 2 > 100 ? 'ar' : '')

export function layout(a: Answered, trackPx = 340): Line {
  const alpha = a.unit === 'alpha'
  const show = (name: string, v: number) => (alpha ? name : `${name} · ${formatValue(v, a.unit, name)}`)
  const ans = a.answer
  const common = ans && ans.name === a.common.name ? null : a.common
  const vals = [a.lo.value, a.hi.value, ...(ans ? [ans.value] : []), ...(common ? [common.value] : [])]
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const f = a.scale === 'log' ? Math.log : (v: number) => v
  const pos = (v: number) => (hi === lo ? 50 : ((f(v) - f(lo)) / (f(hi) - f(lo))) * 100)
  const inv = (x: number) => {
    const y = f(lo) + ((f(hi) - f(lo)) * x) / 100
    return a.scale === 'log' ? Math.exp(y) : y
  }

  const pct = (px: number) => (px / trackPx) * 100
  const pins: (Pin & { start: number; end: number })[] = [
    { kind: 'lo' as const, x: pos(a.lo.value), label: show(a.lo.name, a.lo.value) },
    { kind: 'hi' as const, x: pos(a.hi.value), label: show(a.hi.name, a.hi.value) },
    ...(common ? [{ kind: 'common' as const, x: pos(common.value), label: show(common.name, common.value) }] : []),
  ].map((p) => {
    const w = pct(pxWidth(p.label, 7.4, 6))
    const align = alignFor(p.x, w)
    const start = align === 'al' ? p.x - pct(10) : align === 'ar' ? p.x - w : p.x - w / 2
    return { ...p, align, row: 0, start, end: start + w }
  })
  const rowEnds: number[] = []
  for (const p of [...pins].sort((m, n) => m.start - n.start)) {
    let row = 0
    while (rowEnds[row] !== undefined && p.start < rowEnds[row] + pct(8)) row++
    p.row = row
    rowEnds[row] = p.end
  }

  const zone: [number, number] = [pos(a.lo.value), pos(a.hi.value)]
  let you: Line['you'] = null
  let beyond: Line['beyond'] = null
  if (ans) {
    const x = pos(ans.value)
    const label = (v: number) => (alpha ? ans.name : `${ans.name} · ${formatValue(v, a.unit, ans.name)}`)
    you = { x, from: a.side === 'lo' ? 100 : 0, align: alignFor(x, pct(pxWidth(label(ans.value), 8.2, 24))), label }
    if (a.outcome === 'out') beyond = a.side === 'hi' ? [zone[1], x] : [x, zone[0]]
  }
  return { pins: pins.map(({ start: _s, end: _e, ...p }) => p), zone, you, beyond, inv }
}
