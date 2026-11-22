import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { RoundSummary } from '../../../shared/mode.ts'
import {
  formatValue, meta, metres, PROMPTS, TIERS, TIME_MS,
  type Answered, type InBetweenEvent, type InBetweenView,
} from '../../../shared/modes/inbetween.ts'
import { get, post } from '../../core/api.ts'
import { Share as ShareIcon, TapeCase } from '../../core/icons.tsx'
import { BOUNCE, motionScale, shake, SLIDE, timeline } from '../../core/motion.ts'
import { share, shareText } from '../../core/share.ts'
import { Sheet } from '../../core/Sheet.tsx'
import { load, save } from '../../core/storage.ts'
import { recordResult, stats } from '../../core/streaks.ts'
import { TopBar } from '../../core/TopBar.tsx'
import { Art, artFor, CategoryIcon } from './art.tsx'
import { layout } from './line.ts'
import { Rules } from './Rules.tsx'

interface RoundState { prompt: string | null; view: InBetweenView | null; summary: RoundSummary | null }
interface Day { day: string; number: number; rounds: (RoundState & { slot: number })[] }
type Current = NonNullable<InBetweenView['current']>

const SEEN_RULES = 'inbetween:seen-rules'
const shareTotal = (cm: number) => `${metres(cm)} m of ${PROMPTS} m`

export function Play({ day }: { day: string }) {
  const [data, setData] = useState<Day | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The player pressed Next on a reveal, so the next prompt shows even before its clock starts. */
  const [asking, setAsking] = useState(false)
  /** The player left the last reveal for the results. */
  const [done, setDone] = useState(false)
  /** False while the newest answer's points are still flying up to the tape counter. */
  const [counted, setCounted] = useState(true)
  const [rulesOpen, setRulesOpen] = useState(() => !load(SEEN_RULES, false))
  const busy = useRef(false)
  const closeRules = () => (save(SEEN_RULES, true), setRulesOpen(false))

  const update = (r: RoundState) => setData((d) => d && { ...d, rounds: [{ slot: 0, ...r }] })
  const send = async (path: string, body?: object): Promise<RoundState | null> => {
    setError(null)
    try {
      const r = await post<RoundState>(`${meta.id}/${day}/0/${path}`, body)
      update(r)
      return r
    } catch (e) {
      setError((e as Error).message)
      return null
    }
  }

  const fetchDay = () => {
    setError(null)
    get<Day>(`${meta.id}/${day}`).then((d) => {
      setData(d)
      const r = d.rounds[0]
      if (r?.summary) setDone(true)
      // The home screen's Play button is the start; open the day straight away.
      if (r && !r.view) void post<RoundState>(`${meta.id}/${day}/0/start`).then(update, (e: Error) => setError(e.message))
    }, (e: Error) => setError(e.message))
  }
  useEffect(fetchDay, [day])

  /** Sends one event; reports whether it recorded an answer for `prompt`. */
  const event = async (e: InBetweenEvent) => {
    if (busy.current && e.type !== 'timeout') return null
    busy.current = true
    const r = await send('event', e)
    busy.current = false
    if (r?.view && r.view.answered.length > e.prompt) {
      setAsking(false)
      setCounted(false)
    }
    return r?.view ?? null
  }

  const round = data?.rounds[0]
  const v = round?.view
  const cur = v?.current ?? null
  const last = v?.answered.at(-1)

  let screen: preact.JSX.Element
  let key: string
  if (!data || !round || !v) {
    screen = <Status error={error} onRetry={fetchDay} />
    key = 'status'
  } else if (cur && (cur.msLeft !== null || !last || asking)) {
    key = `ask${cur.index}`
    screen = (
      <Ask key={key} ask={cur} paused={rulesOpen} error={error}
        onBegin={() => event({ type: 'begin', prompt: cur.index })}
        onAnswer={(text) => event({ type: 'answer', prompt: cur.index, text })}
        onTimeout={() => event({ type: 'timeout', prompt: cur.index })} />
    )
  } else if (last && !(done && !cur)) {
    key = `reveal${last.index}`
    screen = (
      <Reveal key={key} a={last} next={cur} fresh={!counted} onCounted={() => setCounted(true)}
        onNext={() => (setCounted(true), cur ? setAsking(true) : setDone(true))} />
    )
  } else {
    key = 'results'
    screen = <Results day={data} view={v} summary={round.summary!} />
  }

  const meter = v ? v.points - (!counted && last ? last.points : 0) : 0
  return (
    <div class="app">
      <TopBar brand={false} start={<Meter value={meter} />} center={v && <Steps view={v} />} onHelp={() => setRulesOpen(true)} />
      <Ruler shiftKey={key} />
      <div class="stage">{screen}</div>
      <Sheet open={rulesOpen} title="How to play" onClose={closeRules}>
        <Rules />
        <button class="btn" onClick={closeRules}>Got it</button>
      </Sheet>
    </div>
  )
}

/** Slides a screen in from the right when it mounts, like a ruler being pulled along. */
function useSlideIn() {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const a = ref.current?.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: 460 * motionScale(), easing: SLIDE })
    return () => a?.cancel()
  }, [])
  return ref
}

/** The thin ruler under the top bar scrolls one notch every time the screen changes. */
function Ruler({ shiftKey }: { shiftKey: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useRef(0)
  useEffect(() => {
    const x0 = x.current
    const x1 = (x.current -= 150)
    ref.current?.animate([{ backgroundPositionX: `${x0}px, ${x0}px` }, { backgroundPositionX: `${x1}px, ${x1}px` }],
      { duration: 460 * motionScale(), easing: SLIDE, fill: 'forwards' })
  }, [shiftKey])
  return <div class="hruler" ref={ref} aria-hidden="true" />
}

function Meter({ value }: { value: number }) {
  const num = useRef<HTMLElement>(null)
  const box = useRef<HTMLSpanElement>(null)
  const shown = useRef(value)
  useEffect(() => {
    const from = shown.current
    if (from === value) return
    shown.current = value
    const tl = timeline()
    tl.tween(500, 0, (e) => num.current && (num.current.textContent = metres(from + (value - from) * e)))
    tl.anim(box.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 420, easing: BOUNCE, fill: 'none' })
    return () => tl.skip()
  }, [value])
  return (
    <span class="meter" ref={box} role="img" aria-label={`Tape pulled: ${metres(value)} metres`}>
      <TapeCase />
      <b ref={num}>{metres(shown.current)}</b>
      <small>m</small>
    </span>
  )
}

function Steps({ view }: { view: InBetweenView }) {
  return (
    <ol class="steps" aria-label={`${view.answered.length} of ${view.total} answered`}>
      {Array.from({ length: view.total }, (_, i) => {
        const a = view.answered[i]
        return <li key={i} class={a ? (a.points ? 'done' : 'miss') : i === view.answered.length ? 'now' : ''} />
      })}
    </ol>
  )
}

function Status({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <main class="screen center">
      <p class={error ? 'note' : 'hint'}>{error ?? 'Unrolling today’s tape…'}</p>
      {error && <button class="btn" onClick={onRetry}>Try again</button>}
    </main>
  )
}

type Named = { name: string; value: number }
const fmt = (unit: string, l: Named) => formatValue(l.value, unit, l.name)
/** Limit readout on the question cards: spelled out for words, approximate for measurements. */
const approx = (a: { unit: string }, l: Named) =>
  a.unit === 'alpha' ? l.name.toUpperCase().split('').join(' ') : a.unit === 'year' ? fmt(a.unit, l) : `~${fmt(a.unit, l)}`

function Ask(props: {
  ask: Current
  paused: boolean
  error: string | null
  onBegin: () => Promise<InBetweenView | null>
  onAnswer: (text: string) => Promise<InBetweenView | null>
  onTimeout: () => Promise<InBetweenView | null>
}) {
  const { ask } = props
  const root = useSlideIn()
  const tape = useRef<HTMLDivElement>(null)
  const secs = useRef<HTMLSpanElement>(null)
  const gauge = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const pull = useRef<Animation | null>(null)
  const begun = useRef(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Words rise in, the limit cards swing in, the tape is pulled out of its case.
  useLayoutEffect(() => {
    const tl = timeline()
    const el = root.current!
    tl.anim(el.querySelector('.eyebrow'), [{ opacity: 0 }, { opacity: 1 }], { delay: 300 })
    el.querySelectorAll('.q span').forEach((w, k) =>
      tl.anim(w, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { delay: 320 + k * 35, duration: 380 }))
    tl.anim(el.querySelector('.end.lo'), [{ opacity: 0, transform: 'translateX(-60px) rotate(-6deg)' }, { opacity: 1, transform: 'none' }], { delay: 600, duration: 550, easing: BOUNCE })
    tl.anim(el.querySelector('.end.hi'), [{ opacity: 0, transform: 'translateX(60px) rotate(6deg)' }, { opacity: 1, transform: 'none' }], { delay: 700, duration: 550, easing: BOUNCE })
    if (ask.msLeft === null)
      pull.current = tl.anim(tape.current, [{ transform: 'translateX(-100%)' }, { transform: 'none' }], { delay: 850, duration: 650, easing: 'cubic-bezier(.2,1.3,.4,1)' })
    return () => tl.stop()
  }, [])

  // Start the clock once the tape is out (and not while the rules are open).
  useEffect(() => {
    if (ask.msLeft !== null || props.paused || begun.current) return
    const t = setTimeout(() => {
      begun.current = true
      void props.onBegin()
    }, 1500 * motionScale())
    return () => clearTimeout(t)
  }, [props.paused, ask.msLeft])

  // The tape slides back into its case as time runs out. Synced to the server on every response.
  useEffect(() => {
    if (ask.msLeft === null) return
    pull.current?.cancel()
    pull.current = null
    input.current?.focus({ preventScroll: true })
    const end = performance.now() + ask.msLeft
    let raf = 0
    let retry: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const left = Math.max(0, end - performance.now())
      if (tape.current) tape.current.style.transform = `translateX(${-(1 - left / TIME_MS) * 100}%)`
      if (secs.current) secs.current.textContent = String(Math.ceil(left / 1000))
      gauge.current?.classList.toggle('warn', left < 5000)
      if (left > 0) raf = requestAnimationFrame(tick)
      // A little after zero, so the server's clock has passed the deadline too.
      else retry = setTimeout(() => void props.onTimeout(), 300)
    }
    raf = requestAnimationFrame(tick)
    return () => (cancelAnimationFrame(raf), clearTimeout(retry))
  }, [ask.msLeft])

  const onInput = () => input.current?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.025)' }, { transform: 'scale(1)' }], { duration: 140 * motionScale() })

  const submit = async (e: Event) => {
    e.preventDefault()
    const text = input.current?.value.trim() ?? ''
    if (sending || ask.msLeft === null) return
    if (!text) return void shake(form.current)
    setSending(true)
    form.current?.animate([{ transform: 'scale(1)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: 180 * motionScale() })
    const v = await props.onAnswer(text)
    setSending(false)
    if (!v || v.answered.length > ask.index) return // recorded: the reveal takes over
    setMsg(v.current?.note === 'limit' ? 'That’s one of the limits. Name something in between.' : `“${text}” isn’t on our list. One more try.`)
    shake(form.current)
    input.current?.select()
  }

  return (
    <main class="screen ask" ref={root}>
      <p class="eyebrow"><CategoryIcon c={ask.category} />Prompt {ask.index + 1} of {PROMPTS} · {ask.title}</p>
      <h1 class="q">{ask.question.split(' ').map((w, k) => <><span key={k}>{w}</span> </>)}</h1>
      <div class="ends">
        <div class="end lo"><span class="tag">FROM</span><b>{ask.lo.name}</b><span class="readout">{approx(ask, ask.lo)}</span></div>
        <div class="end hi"><span class="tag">TO</span><b>{ask.hi.name}</b><span class="readout">{approx(ask, ask.hi)}</span></div>
      </div>
      <div class="gauge" ref={gauge} aria-hidden="true">
        <div class="gcase"><span class="secs" ref={secs}>{Math.ceil((ask.msLeft ?? TIME_MS) / 1000)}</span></div>
        <div class="run"><div class="tape" ref={tape} /></div>
      </div>
      <form class="answer" ref={form} onSubmit={submit} autocomplete="off">
        {/* type=search and name=search stop iOS offering contacts to AutoFill. */}
        <input ref={input} type="search" name="search" enterkeyhint="go" autocapitalize="off" autocorrect="off" spellcheck={false}
          maxLength={60} placeholder="Type your answer" aria-label="Your answer" onInput={onInput} />
        <button disabled={sending || ask.msLeft === null}>Measure</button>
      </form>
      <p class="msg" role="status">{props.error ?? msg}</p>
    </main>
  )
}

function Reveal(props: { a: Answered; next: Current | null; fresh: boolean; onCounted: () => void; onNext: () => void }) {
  const { a } = props
  const root = useSlideIn()
  const track = useRef<HTMLDivElement>(null)
  const tl = useRef(timeline())
  const [line] = useState(() => layout(a, Math.max(200, Math.min(440, innerWidth) - 64)))
  const ans = a.answer
  const tier = ans?.tier

  useLayoutEffect(() => {
    const t = tl.current
    const el = root.current!
    const q = (s: string) => el.querySelector(s)
    const D = 380 // after the slide-in
    t.anim(q('.eyebrow'), [{ opacity: 0 }, { opacity: 1 }], { delay: D })
    t.anim(q('.bar'), [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { delay: D, duration: 550 })
    t.anim(q('.ticks'), [{ opacity: 0 }, { opacity: 1 }], { delay: D + 250 })
    t.anim(q('.zone'), [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { delay: D + 250, duration: 550 })
    el.querySelectorAll('.pin.lim').forEach((p, k) =>
      t.anim(p, [{ opacity: 0, transform: 'translateY(-30px)' }, { opacity: 1, transform: 'none' }], { delay: D + 380 + k * 140, duration: 520, easing: BOUNCE }))
    let T = D + 800
    const you = line.you
    if (you && ans) {
      const pin = q('.pin.you') as HTMLElement
      const lab = q('.pin.you .lab') as HTMLElement
      t.anim(pin, [{ left: `${you.from}%`, opacity: 0 }, { left: `${you.from}%`, opacity: 1, offset: 0.1 }, { left: `${you.x}%` }],
        { delay: T, duration: 1100, easing: 'cubic-bezier(.3,.85,.35,1.12)' })
      lab.textContent = you.label(line.inv(you.from))
      t.tween(1100, T, (e) => (lab.textContent = e === 1 ? you.label(ans.value) : you.label(line.inv(you.from + (you.x - you.from) * e))))
      T += 1150
      if (line.beyond) {
        t.anim(q('.beyond'), [{ opacity: 0, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)' }], { delay: T - 500, duration: 450 })
        t.anim(q('.nl'), [{ transform: 'none' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }], { delay: T - 80, duration: 380, easing: 'linear' })
      }
    } else T += 300
    const card = q('.verdict')
    const n = q('.pts .n') as HTMLElement
    t.anim(card, [{ opacity: 0, transform: 'perspective(700px) rotateX(-85deg)' }, { opacity: 1, transform: 'none' }], { delay: T, duration: 560, easing: BOUNCE })
    t.anim(q('.badge'), [{ transform: 'scale(0) rotate(-40deg)' }, { transform: 'scale(1.35) rotate(10deg)', offset: 0.65 }, { transform: 'none' }], { delay: T + 160, duration: 620 })
    n.textContent = '0'
    t.tween(650, T + 250, (e) => (n.textContent = String(Math.round(a.points * e))))
    if (!a.points) t.anim(card, [{ transform: 'none' }, { transform: 'translateX(-9px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'none' }], { delay: T + 560, duration: 360, easing: 'linear', composite: 'add' })
    if (tier === 'milestone') {
      t.anim(q('.shine'), [{ transform: 'translateX(-120%)' }, { transform: 'translateX(120%)' }], { delay: T + 100, duration: 900, easing: 'ease-in-out', iterations: 2 })
      el.querySelectorAll('.spark').forEach((s, k) => {
        const ang = (k / 10) * Math.PI * 2
        const d = 34 + (k % 3) * 10
        t.anim(s, [{ transform: 'translate(-50%,0) scale(.4)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * d}px), ${Math.sin(ang) * d}px) scale(1.1) rotate(90deg)`, opacity: 0 }],
          { delay: T + 200 + (k % 2) * 80, duration: 800, easing: 'cubic-bezier(.1,.8,.3,1)' })
      })
    }
    // The points fly up to the tape counter, which then counts up.
    t.later(T + 950, () => {
      if (!props.fresh || !a.points) return props.onCounted()
      const from = q('.pts')!.getBoundingClientRect()
      const to = document.querySelector('.meter')?.getBoundingClientRect()
      if (!to) return props.onCounted()
      const chip = document.createElement('span')
      chip.className = 'chip'
      chip.textContent = `+${a.points} cm`
      document.body.appendChild(chip)
      const fly = t.anim(chip, [
        { transform: `translate(${from.left}px,${from.top}px) scale(.8)`, opacity: 0 },
        { transform: `translate(${from.left - 10}px,${from.top - 26}px) scale(1.1)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${to.left}px,${to.top}px) scale(.6)`, opacity: 0.2 },
      ], { duration: 700, easing: 'cubic-bezier(.5,0,.3,1)' })
      const land = () => (chip.remove(), props.onCounted())
      fly ? fly.finished.then(land, land) : land()
    })
    const rest = el.querySelectorAll('.fact,.alt,.source,.upnext')
    rest.forEach((r, k) => t.anim(r, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { delay: T + 500 + k * 110 }))
    t.anim(q('.next'), [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { delay: T + 600 + rest.length * 110, easing: BOUNCE, duration: 500 })
    return () => {
      t.skip()
      t.stop()
    }
  }, [])

  const out = a.outcome === 'out'
  let head: string, sub: preact.ComponentChildren
  if (a.outcome === 'hit' && tier) [head, sub] = [ans!.name, <><i>{TIERS[tier].name}</i> · {TIERS[tier].desc}</>]
  else if (a.outcome === 'close') [head, sub] = [ans!.name, <><i>Close call</i> · right on the line</>]
  else if (out)
    [head, sub] = [ans!.name, <><i>Off the tape</i> · {a.unit === 'alpha'
      ? `comes ${a.side === 'hi' ? `after ${a.hi.name}` : `before ${a.lo.name}`}`
      : `too ${a.side === 'hi' ? a.words[0] : a.words[1]}`}</>]
  else if (a.outcome === 'time') [head, sub] = ['Out of time', 'The tape snapped back']
  else [head, sub] = [a.text ?? '', 'Not on our list']
  const fact = ans?.fact ?? (a.points ? undefined : a.rarest.fact)
  const foundRarest = ans?.name === a.rarest.name
  const skip = (e: PointerEvent) => !(e.target as Element).closest('button') && tl.current.skip()

  return (
    <main class={`screen reveal t-${a.outcome === 'hit' ? tier : a.outcome}`} ref={root} onPointerDown={skip}>
      <p class="eyebrow"><CategoryIcon c={a.category} />Prompt {a.index + 1} of {PROMPTS} · {a.title}</p>
      <div class="verdict" role="status">
        <span class="badge"><Art k={artFor(a.outcome, tier)} size={52} /></span>
        <div><b>{head}</b><small>{sub}</small></div>
        <span class="pts">{a.points ? '+' : ''}<span class="n">{a.points}</span><small>cm</small></span>
      </div>
      <div class="nl" aria-hidden="true">
        <div class="track" ref={track}>
          <div class="bar" />
          <div class="ticks" />
          <div class="zone" style={{ left: `${line.zone[0]}%`, width: `${line.zone[1] - line.zone[0]}%` }}><div class="shine" /></div>
          {line.beyond && <div class={`beyond ${a.side}`} style={{ left: `${line.beyond[0]}%`, width: `${line.beyond[1] - line.beyond[0]}%` }} />}
          {line.pins.map((p) => (
            <div key={p.kind} class={`pin ${p.kind === 'common' ? 'com lim' : 'lim'} ${p.align} row${p.row}`} style={{ left: `${p.x}%` }}>
              <div class="dot" />
              <span class="lab">{p.kind === 'common' ? `Most said: ${p.label}` : p.label}</span>
            </div>
          ))}
          {line.you && (
            <div class={`pin you ${out ? 'out' : ''} ${line.you.align}`} style={{ left: `${line.you.x}%` }}>
              <div class="dot" />
              <span class="lab">{line.you.label(ans!.value)}</span>
              {tier === 'milestone' && Array.from({ length: 10 }, (_, k) => (
                <svg key={k} class="spark" width="14" height="14" viewBox="0 0 16 16"><path d="M8 0l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" /></svg>
              ))}
            </div>
          )}
        </div>
      </div>
      {fact && <div class="fact"><span class="note">Tape note</span>{fact}</div>}
      <div class="alt"><span>Most common answer</span><b>{a.common.name}</b></div>
      <div class="alt">
        <span><Art k="milestone" size={22} />{foundRarest ? 'Rarest pick' : 'Could have said'}</span>
        <b>{foundRarest ? 'You found it' : a.unit === 'alpha' ? a.rarest.name : `${a.rarest.name} · ${fmt(a.unit, a.rarest)}`}</b>
      </div>
      <p class="source">Source: {a.source}</p>
      <div class="upnext">
        {props.next
          ? <><span>Up next · {props.next.index + 1} of {PROMPTS}</span><b><CategoryIcon c={props.next.category} />{props.next.title}</b></>
          : <><span>That was the last one</span><b>See your tape</b></>}
      </div>
      <button class="btn next" onClick={props.onNext} autofocus>{props.next ? 'Next prompt ▸' : 'See my tape ▸'}</button>
    </main>
  )
}

function untilMidnight() {
  const now = new Date()
  const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
  return `${Math.floor(ms / 3_600_000)}h ${String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0')}m`
}

function Results({ day, view, summary }: { day: Day; view: InBetweenView; summary: RoundSummary }) {
  const root = useSlideIn()
  const [st] = useState(() => stats(recordResult(meta.id, day.day, summary.score), day.day))
  const [shared, setShared] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(untilMidnight)
  const cm = summary.score
  useEffect(() => {
    const id = setInterval(() => setCountdown(untilMidnight()), 30_000)
    return () => clearInterval(id)
  }, [])

  useLayoutEffect(() => {
    const t = timeline()
    const el = root.current!
    const q = (s: string) => el.querySelector(s)
    const D = 400
    const m = q('.measure .m') as HTMLElement
    t.anim(q('.eyebrow'), [{ opacity: 0 }, { opacity: 1 }], { delay: D })
    t.anim(q('.bigtape .case'), [{ transform: 'rotate(-20deg) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: D, duration: 500, easing: BOUNCE })
    t.anim(q('.fill'), [{ transform: 'translateX(-100%)' }, { transform: `translateX(${(cm / (PROMPTS * 100)) * 100 - 100}%)` }], { delay: D + 300, duration: 1600, easing: 'cubic-bezier(.2,.9,.3,1.04)' })
    m.textContent = '0.00'
    t.tween(1600, D + 300, (e) => (m.textContent = metres(cm * e)))
    t.anim(q('.scale'), [{ opacity: 0 }, { opacity: 1 }], { delay: D + 300 })
    t.anim(q('.of'), [{ opacity: 0 }, { opacity: 1 }], { delay: D + 600 })
    el.querySelectorAll('.grid li').forEach((s, k) =>
      t.anim(s, [{ transform: 'scale(0) rotate(-30deg)', opacity: 0 }, { transform: 'scale(1.3)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { delay: D + 1900 + k * 120, duration: 420 }))
    t.anim(q('.stats'), [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { delay: D + 2500 })
    t.anim(q('.rows'), [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { delay: D + 2600, duration: 350 })
    el.querySelectorAll('.rows li').forEach((li, k) =>
      t.anim(li, [{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }], { delay: D + 2700 + k * 70, duration: 350 }))
    t.anim(q('.share'), [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { delay: D + 3200, easing: BOUNCE, duration: 500 })
    const skip = (e: PointerEvent) => !(e.target as Element).closest('button') && t.skip()
    el.addEventListener('pointerdown', skip)
    return () => (el.removeEventListener('pointerdown', skip), t.skip(), t.stop())
  }, [])

  const text = shareText(meta, day.number, [summary], location.origin, shareTotal)
  const onShare = async () => {
    const r = await share(text)
    setShared(r === 'copied' ? 'Copied. Paste it anywhere.' : r === 'failed' ? 'Could not share. Copy the text below.' : null)
  }

  return (
    <main class="screen results" ref={root}>
      <p class="eyebrow">Daily #{day.number} complete</p>
      <h1 class="measure" aria-label={`${metres(cm)} metres`}><span class="m">{metres(cm)}</span><small>m</small></h1>
      <p class="of">pulled out of a {PROMPTS} m tape</p>
      <div class="bigtape" aria-hidden="true"><div class="case"><i /></div><div class="rule"><div class="fill" /></div></div>
      <div class="scale" aria-hidden="true">{Array.from({ length: PROMPTS + 1 }, (_, m) => <span key={m}>{m}</span>)}</div>
      <ol class="grid" aria-label="Your picks">
        {view.answered.map((a) => (
          <li key={a.index} title={`${a.title}: ${a.points} cm`}><Art k={artFor(a.outcome, a.answer?.tier)} size={40} /></li>
        ))}
      </ol>
      <dl class="stats">
        <div><dt>Played</dt><dd>{st.played}</dd></div>
        <div><dt>Streak</dt><dd>{st.streak}</dd></div>
        <div><dt>Longest</dt><dd>{metres(st.bestDay)}<small> m</small></dd></div>
      </dl>
      <ol class="rows" aria-label="All prompts">
        {view.answered.map((a) => (
          <li key={a.index}>
            <span class="pair" title={a.title}><CategoryIcon c={a.category} /></span>
            <span class="ans">{a.answer?.name ?? (a.outcome === 'time' ? 'Out of time' : a.text)}</span>
            <span class="tier"><Art k={artFor(a.outcome, a.answer?.tier)} size={30} /></span>
            <b>{a.points}</b>
          </li>
        ))}
      </ol>
      {shared && <p class="hint" role="status">{shared}</p>}
      {shared?.startsWith('Could not') && <pre class="sharetext">{text}</pre>}
      <button class="btn y share" onClick={onShare}><ShareIcon /> Share my tape</button>
      <p class="nextin">New tape in <b>{countdown}</b></p>
    </main>
  )
}
