import { useState } from 'preact/hooks'
import { Help, Settings as SettingsIcon } from './icons.tsx'
import { updateSettings, useSettings } from './settings.ts'
import { Sheet } from './Sheet.tsx'

/** Top bar shared by every screen: brand (or a mode's own badge), a middle slot (progress), help, settings. */
export function TopBar(props: { brand?: boolean; start?: preact.ComponentChildren; center?: preact.ComponentChildren; onHelp?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <header class="topbar">
      {props.brand !== false && (
        <a href="#/" class="brand" aria-label="In Between home">
          <span class="in">IN </span><b>BETWEEN</b>
        </a>
      )}
      {props.start}
      <div class="topbar-center">{props.center}</div>
      <div class="topbar-actions">
        {props.onHelp && (
          <button class="icon" aria-label="How to play" onClick={props.onHelp}>
            <Help />
          </button>
        )}
        <button class="icon" aria-label="Settings" onClick={() => setOpen(true)}>
          <SettingsIcon />
        </button>
      </div>
      <Sheet open={open} title="Settings" onClose={() => setOpen(false)}>
        <SettingsForm />
      </Sheet>
    </header>
  )
}

function SettingsForm() {
  const s = useSettings()
  return (
    <div class="settings">
      <fieldset class="segmented">
        <legend>Theme</legend>
        {(['light', 'dark'] as const).map((t) => (
          <label key={t}>
            <input type="radio" name="theme" checked={s.theme === t} onChange={() => updateSettings({ theme: t })} />
            <span>{t === 'light' ? 'Light' : 'Dark'}</span>
          </label>
        ))}
      </fieldset>
      <label class="switch">
        <span>
          <strong>High contrast</strong>
          <small>Blue and orange for in and out of range, and stronger text.</small>
        </span>
        <input type="checkbox" role="switch" checked={s.contrast} onChange={() => updateSettings({ contrast: !s.contrast })} />
      </label>
    </div>
  )
}
