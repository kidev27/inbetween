import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { dayNumber, localDayKey } from '../shared/day.ts'
import { Tally } from './core/icons.tsx'
import { BOUNCE, timeline } from './core/motion.ts'
import { Privacy } from './core/Privacy.tsx'
import { Sheet } from './core/Sheet.tsx'
import { getHistory, stats } from './core/streaks.ts'
import { TapeBand } from './core/TapeBand.tsx'
import { TopBar } from './core/TopBar.tsx'
import type { ClientMode } from './mode.ts'
import { clientModes } from './modes/registry.ts'

const route = () => location.hash.replace(/^#\/?/, '')

export function App() {
  const [path, setPath] = useState(route)
  useEffect(() => {
    const on = () => setPath(route())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  const mode = clientModes.find((m) => m.meta.id === path)
  return mode ? <mode.Play day={localDayKey()} /> : <Home />
}

const format = (m: ClientMode, total: number) => m.formatScore?.(total) ?? `${total}${m.meta.scoreUnit}`

function Home() {
  const today = localDayKey()
  const [rules, setRules] = useState<ClientMode | null>(null)
  const [privacy, setPrivacy] = useState(false)
  const date = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const root = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const tl = timeline()
    const q = (s: string) => root.current?.querySelector(s)
    tl.anim(q('.eyebrow'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { delay: 250 })
    tl.anim(q('.logo .a'), [{ opacity: 0, transform: 'translateY(-30px)' }, { opacity: 1, transform: 'none' }], { delay: 350, duration: 500, easing: BOUNCE })
    tl.anim(q('.logo .w'), [{ opacity: 0, transform: 'rotate(-16deg) scale(1.5)' }, { opacity: 1, transform: 'rotate(-2deg)' }], { delay: 520, duration: 520, easing: BOUNCE })
    root.current?.querySelectorAll('.mode > *').forEach((el, k) =>
      tl.anim(el, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { delay: 850 + k * 120, easing: BOUNCE, duration: 500 }))
    return () => tl.stop()
  }, [])

  return (
    <div class="app">
      <TopBar brand={false} />
      <TapeBand />
      <main class="scroll hero" ref={root}>
        <p class="eyebrow">
          Daily #{dayNumber(today)} · {date}
        </p>
        <h1 class="logo">
          <span class="a">IN</span>
          <br />
          <span class="w">BETWEEN</span>
        </h1>
        {clientModes.map((m) => {
          const history = getHistory(m.meta.id)
          const st = stats(history, today)
          return (
            <section key={m.meta.id} class="mode" aria-label={m.meta.title}>
              <p class="lead">{m.meta.tagline}</p>
              {(st.streak > 0 || st.bestDay > 0) && (
                <p class="streak">
                  {st.streak > 0 && <><Tally /> {st.streak}-day streak</>}
                  {st.streak > 0 && st.bestDay > 0 && ' · '}
                  {st.bestDay > 0 && `Longest ${format(m, st.bestDay)}`}
                </p>
              )}
              <a class="btn y" href={`#/${m.meta.id}`}>
                {today in history ? 'See today’s tape' : 'Play today'}
              </a>
              <p class="links">
                {m.Rules && (
                  <button class="link" onClick={() => setRules(m)}>
                    How to play
                  </button>
                )}
                <button class="link" onClick={() => setPrivacy(true)}>
                  Privacy
                </button>
              </p>
            </section>
          )
        })}
      </main>
      {rules?.Rules && (
        <Sheet open title="How to play" onClose={() => setRules(null)}>
          <rules.Rules />
        </Sheet>
      )}
      <Sheet open={privacy} title="Privacy" onClose={() => setPrivacy(false)}>
        <Privacy />
      </Sheet>
    </div>
  )
}
