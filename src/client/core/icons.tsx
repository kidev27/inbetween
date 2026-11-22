// Inline SVG icons drawn for this game: currentColor line art, with a tape-yellow fill on accent shapes.
// Decorative: the button or text next to them carries the label.
const svg = (d: preact.ComponentChildren, size = 24) => (
  <svg class="ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{d}</svg>
)

export const Help = () => svg(<><circle cx="12" cy="12" r="9.5" /><path d="M9.4 9.4a2.7 2.7 0 1 1 3.6 2.5c-.7.3-1 .8-1 1.5v.6" /><path d="M12 17.2v.1" /></>)
export const Settings = () => svg(<><path d="M4 7h9M18 7h2M4 17h3M12 17h8" /><circle cx="15.5" cy="7" r="2.5" /><circle cx="9.5" cy="17" r="2.5" /></>)
export const Share = () => svg(<><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></>, 20)
export const Close = () => svg(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>)
/** Tally marks, for streaks. */
export const Tally = () => svg(<path d="M5 5v14M9 5v14M13 5v14M17 5v14M3 16.5 19 7.5" />, 18)
/** The tape measure case: the game's mark. */
export const TapeCase = () => (
  <svg class="case-ic" width="30" height="26" viewBox="0 0 30 26" aria-hidden="true">
    <rect x="0" y="0" width="22" height="24" rx="6" class="case-body" />
    <circle cx="11" cy="12" r="5.5" fill="none" stroke="#f5c518" stroke-width="2.5" />
    <rect x="20" y="17" width="10" height="5" rx="1" fill="#f5c518" />
  </svg>
)
