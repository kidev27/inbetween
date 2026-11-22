import type { ComponentType } from 'preact'
import type { ModeMeta } from '../shared/mode.ts'

/** Client half of a game mode: its metadata and the screen that plays one day. */
export interface ClientMode {
  /** How to play, shown in a sheet on first visit and from the help button. */
  Rules?: ComponentType
  meta: ModeMeta
  Play: ComponentType<{ day: string }>
  /** A day's total for people, e.g. "4.30 m". Defaults to the number and meta.scoreUnit. */
  formatScore?: (total: number) => string
}
