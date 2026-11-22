// Contract every game mode fulfils. Core code (home, streaks, share, API routes) only sees these.
export interface ModeMeta {
  id: string
  title: string
  tagline: string
  roundsPerDay: number
  scoreUnit: string
}

export interface RoundSummary {
  score: number
  /** How the round ended, in the mode's own words (stored as the run's status). */
  outcome: string
  /** Spoiler-free glyph line for share text. */
  glyph: string
}
