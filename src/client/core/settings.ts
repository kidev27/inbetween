import { useEffect, useState } from 'preact/hooks'
import { load, save } from './storage.ts'

export interface Settings {
  theme: 'light' | 'dark'
  /** Colour-blind-safe right/wrong colours and stronger text. */
  contrast: boolean
}

const KEY = 'inbetween:settings'
const THEME_COLOR = { light: '#fbf7ee', dark: '#15140f' }
const systemTheme = (): Settings['theme'] => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

let current: Settings = { theme: systemTheme(), contrast: false, ...load<Partial<Settings>>(KEY, {}) }
const listeners = new Set<() => void>()

export const getSettings = () => current

/** Puts the settings on <html> so CSS tokens switch. Call before the first render to avoid a flash. */
export function applySettings() {
  const root = document.documentElement
  root.dataset.theme = current.theme
  root.toggleAttribute('data-contrast', current.contrast)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[current.theme])
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch }
  save(KEY, current)
  applySettings()
  listeners.forEach((f) => f())
}

export function useSettings(): Settings {
  const [, rerender] = useState(0)
  useEffect(() => {
    const f = () => rerender((n) => n + 1)
    listeners.add(f)
    return () => void listeners.delete(f)
  }, [])
  return current
}
