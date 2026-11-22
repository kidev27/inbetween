import type { ModeMeta, RoundSummary } from '../src/shared/mode.ts'

/**
 * Server half of a game mode. `apply` is a pure reducer so the same mode can later be driven by
 * WebSocket events in a live room instead of HTTP requests.
 */
export interface ServerMode<P = any, S = any, E = any, V = any> {
  meta: ModeMeta
  /** JSON schema for one event body; Fastify rejects anything else with 400. */
  eventSchema: object
  /** Validate one round of content. Throws with a reason. */
  parse(raw: unknown): P
  /** Public part of the round, revealed once the player starts it. */
  prompt(puzzle: P): string
  start(puzzle: P, now: number): S
  apply(state: S, event: E, puzzle: P, now: number): S
  /** What the player may see. Must never include anything not yet revealed. */
  view(state: S, now: number, puzzle: P): V
  /** Non-null once the round is over. */
  summary(state: S): RoundSummary | null
}
