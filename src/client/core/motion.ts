// A small animation timeline on the Web Animations API. Every effect it starts can be finished at
// once (tap to skip) or stopped (screen unmounts). Reduced motion makes everything near-instant.

export const EASE = 'cubic-bezier(.2,.8,.2,1)'
export const BOUNCE = 'cubic-bezier(.3,1.6,.5,1)'
export const SLIDE = 'cubic-bezier(.65,0,.25,1)'

export const motionScale = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.01 : 1)

interface Running {
  finish(): void
  stop(): void
}

export type Timeline = ReturnType<typeof timeline>

export function timeline() {
  const speed = motionScale()
  let running: Running[] = []
  let dead = false

  return {
    speed,
    anim(el: Element | null | undefined, kf: Keyframe[], o: KeyframeAnimationOptions & { duration?: number; delay?: number } = {}) {
      if (!el || dead) return null
      const a = el.animate(kf, { easing: EASE, fill: 'both', ...o, duration: (o.duration ?? 400) * speed, delay: (o.delay ?? 0) * speed })
      running.push({ finish: () => a.finish(), stop: () => {} })
      return a
    },
    later(ms: number, fn: () => void) {
      let done = false
      const run = () => {
        if (!done && !dead) (done = true), fn()
      }
      const t = setTimeout(run, ms * speed)
      running.push({ finish: () => (clearTimeout(t), run()), stop: () => clearTimeout(t) })
    },
    /** Calls step(0..1) every frame for `ms`, starting after `delay`. */
    tween(ms: number, delay: number, step: (e: number) => void, ease = (e: number) => 1 - (1 - e) ** 3) {
      let done = false
      let start: number | null = null
      let raf = 0
      const f = (t: number) => {
        if (done || dead) return
        start ??= t + delay * speed
        const p = Math.min(1, Math.max(0, (t - start) / Math.max(1, ms * speed)))
        step(ease(p))
        if (p < 1) raf = requestAnimationFrame(f)
        else done = true
      }
      raf = requestAnimationFrame(f)
      running.push({ finish: () => !done && !dead && ((done = true), step(1)), stop: () => cancelAnimationFrame(raf) })
    },
    skip() {
      while (running.length) running.splice(0).forEach((r) => { try { r.finish() } catch { /* already gone */ } })
    },
    stop() {
      dead = true
      running.forEach((r) => r.stop())
      running = []
    },
  }
}

export const shake = (el: Element | null | undefined) =>
  el?.animate(
    [{ transform: 'none' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(9px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }],
    { duration: 380 * motionScale() },
  )
