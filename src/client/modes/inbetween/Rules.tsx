import { CLOSE_POINTS, PROMPTS, TIERS, TIME_MS, type Tier } from '../../../shared/modes/inbetween.ts'
import { Art } from './art.tsx'

export function Rules() {
  return (
    <div class="rules">
      <ol class="rule-list">
        <li>Every day there are {PROMPTS} prompts. Each names two limits, like a cat and a horse.</li>
        <li>Name one thing that fits between them. You have {TIME_MS / 1000} seconds.</li>
        <li>Rarer answers pull out more tape. Every point is one centimetre, so a perfect day is {PROMPTS} m.</li>
        <li>An answer we don’t know gets one more try. Just outside a limit is a close call: {CLOSE_POINTS} cm.</li>
      </ol>
      <ul class="tiers" aria-label="Tiers">
        {(Object.keys(TIERS) as Tier[]).map((t) => (
          <li key={t}>
            <Art k={t} size={40} />
            <b>{TIERS[t].name}</b>
            <span>{TIERS[t].points} cm</span>
          </li>
        ))}
      </ul>
      <p class="hint">One puzzle a day, the same for everyone.</p>
    </div>
  )
}
