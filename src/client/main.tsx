import { render } from 'preact'
import { App } from './app.tsx'
import { applySettings } from './core/settings.ts'
import './theme.css'

// Keep the layout inside the visible area when the on-screen keyboard opens (iOS ignores dvh for it).
const vv = window.visualViewport
if (vv) {
  const fit = () => {
    document.documentElement.style.setProperty('--vh', `${vv.height}px`)
    document.documentElement.style.setProperty('--vtop', `${vv.offsetTop}px`)
    // Little height left (a phone keyboard is up, or a short window): the question screen compacts.
    document.documentElement.toggleAttribute('data-tight', vv.height < 560)
  }
  vv.addEventListener('resize', fit)
  vv.addEventListener('scroll', fit)
  fit()
}

applySettings()
render(<App />, document.getElementById('app')!)
