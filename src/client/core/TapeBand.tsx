import { useLayoutEffect, useRef } from 'preact/hooks'
import { timeline } from './motion.ts'

/** The yellow measuring tape across the top of the home screen. It unreels when the screen opens. */
export function TapeBand() {
  const strip = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const tl = timeline()
    tl.anim(strip.current, [{ transform: 'translateX(-60%)' }, { transform: 'none' }], { duration: 1100, easing: 'cubic-bezier(.15,.9,.25,1)' })
    return () => tl.stop()
  }, [])
  return (
    <div class="tapeband" aria-hidden="true">
      <div class="strip" ref={strip}>
        {Array.from({ length: 40 }, (_, k) => <span key={k}>{k ? k * 10 : ''}</span>)}
      </div>
    </div>
  )
}
