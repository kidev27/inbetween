// Drawn for In Between: tier art (measuring things that get bigger as answers get rarer) and one
// line icon per category. Outlines use currentColor so they follow the theme; fills are fixed.
import type { Category, Outcome, Tier } from '../../../shared/modes/inbetween.ts'

const ART = {
  pin: '<g transform="translate(32 34) scale(1.3) rotate(28) translate(-32 -34)"><path d="M32 42v16" stroke="#8a8476"/><path d="M25 41l2.5-15h9l2.5 15z" fill="#2f8a4a"/><ellipse cx="32" cy="42" rx="13" ry="4.5" fill="#3fa65d"/><ellipse cx="32" cy="24" rx="10" ry="4.5" fill="#5cc27a"/></g>',
  ruler: '<g transform="rotate(-30 32 32)"><rect x="5" y="24" width="54" height="16" rx="3" fill="#2f6fd3"/><path d="M11 26v5M17 26v3M23 26v5M29 26v3M35 26v7M41 26v3M47 26v5M53 26v3" stroke="#fff" stroke-width="2" stroke-linecap="butt"/></g>',
  yardstick: '<path d="M8 52L22 24L38 46L56 12" stroke-width="14"/><path d="M8 52L22 24L38 46L56 12" stroke="#e08a12" stroke-width="8"/><path d="M12.5 42.5l3 1.5M17 33.5l3 1.5M27 31l-2.5 2M32 38l-2.5 2M43 37l-3-1.5M48 28l-3-1.5" stroke="#fff4c4" stroke-width="1.8"/><circle cx="22" cy="24" r="3.2" fill="#fff4c4" stroke-width="2"/><circle cx="38" cy="46" r="3.2" fill="#fff4c4" stroke-width="2"/>',
  milestone: '<path d="M8 56h48"/><path d="M19 56V29a13 13 0 0 1 26 0v27z" fill="#138fbf"/><text x="32" y="38" text-anchor="middle" font-family="Overpass,system-ui" font-weight="800" font-size="8" fill="#fff" stroke="none" letter-spacing=".5">MI</text><text x="32" y="53" text-anchor="middle" font-family="Overpass,system-ui" font-weight="800" font-size="15" fill="#fff" stroke="none">1</text><path d="M51 5l2 4.6 4.6 2-4.6 2L51 18.2l-2-4.6-4.6-2 4.6-2z" fill="#f5c518" stroke-width="2"/><path d="M12 13l1.2 2.8 2.8 1.2-2.8 1.2L12 21l-1.2-2.8L8 17l2.8-1.2z" fill="#f5c518" stroke-width="1.6"/>',
  close: '<path d="M48 6v52" stroke="#2f8a4a" stroke-dasharray="5 6"/><path d="M4 26h38v12H4z" fill="#f5c518"/><path d="M10 27v5M16 27v3M22 27v5M28 27v3M34 27v5" stroke="#1d1b16" stroke-width="2"/><path d="M41 20h6v24h-6z" fill="#b9b3a5"/>',
  out: '<g transform="rotate(-16 18 32)"><path d="M2 26h24l-3 3.5 4 3-3 3.5 2 3.5H2z" fill="#f5c518"/><path d="M8 27v5M14 27v3M20 27v5" stroke="#1d1b16" stroke-width="2"/></g><g transform="rotate(16 46 32)"><path d="M62 26H38l3 3.5-4 3 3 3.5-2 3.5h24z" fill="#f5c518"/><path d="M44 27v5M50 27v3M56 27v5" stroke="#1d1b16" stroke-width="2"/></g><path d="M30 13l1.5 6M36.5 12.5l-1.2 6M31.5 46l.6 5.5" stroke="#c63d2f" stroke-width="2.5"/>',
  time: '<path d="M27 6h10M32 6v6M48 17l4-4"/><circle cx="32" cy="37" r="20" fill="#fff"/><path d="M32 20v3M49 37h-3M32 54v-3M15 37h3" stroke="#1d1b16" stroke-width="2.5"/><path d="M32 37l9-10" stroke="#c63d2f" stroke-width="3.5"/><circle cx="32" cy="37" r="2.6" fill="#1d1b16" stroke="none"/>',
  unknown: '<path d="M5 32l14-16h40v32H19z" fill="#fff4c4"/><circle cx="19" cy="32" r="3" fill="#fbf7ee" stroke-width="2"/><text x="40" y="42" text-anchor="middle" font-family="Overpass,system-ui" font-weight="800" font-size="26" fill="#c63d2f" stroke="none">?</text>',
}
export type ArtKey = keyof typeof ART

/** Static strings drawn above, never user input, so setting them as markup is safe. */
export const Art = ({ k, size = 48 }: { k: ArtKey; size?: number }) => (
  <svg class="art" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor"
    stroke-width="3" stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML={{ __html: ART[k] }} />
)

/** The art for how a prompt went. */
export const artFor = (outcome: Outcome, tier?: Tier): ArtKey =>
  outcome === 'hit' && tier ? tier : outcome === 'close' ? 'close' : outcome === 'time' ? 'time' : outcome === 'unknown' ? 'unknown' : 'out'

const ICON: Record<Category, string> = {
  speed: '<path d="M3 8h6M2 12h8M3 16h6"/><path class="a" d="M12 5.5l8.5 6.5-8.5 6.5z"/>',
  weight: '<path d="M12 4v16M8 20h8M4.5 7h15"/><path class="a" d="M1.5 14a3 3 0 0 0 6 0zM16.5 14a3 3 0 0 0 6 0z"/><path d="M4.5 7l-3 7M4.5 7l3 7M19.5 7l-3 7M19.5 7l3 7"/>',
  landmark: '<path class="a" d="M4 21V10h6v11"/><path d="M10 21V3h8v18M2 21h20M13.5 7h1M13.5 11h1M13.5 15h1"/>',
  population: '<circle class="a" cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15.8 14.2A4.8 4.8 0 0 1 21.5 19"/>',
  year: '<path d="M6 3h12M6 21h12"/><path d="M8 3v2.5a4 4 0 0 0 1.6 3.2L12 12l2.4-3.3A4 4 0 0 0 16 5.5V3M8 21v-2.5a4 4 0 0 1 1.6-3.2L12 12l2.4 3.3A4 4 0 0 1 16 18.5V21"/><path class="a" d="M9.8 20h4.4L12 17z" stroke-width="1.5"/>',
  alpha: '<path d="M2.5 19L7 6l4.5 13M4.2 14.5h5.6"/><path d="M14 8h7l-7 11h7"/>',
  mountain: '<path class="a" d="M2 20l7.5-13 4.5 7 2.5-3.5L22 20z"/><path d="M7.4 10.6L9.5 7l2.3 3.6"/>',
}

export const CategoryIcon = ({ c, size = 20 }: { c: Category; size?: number }) => (
  <svg class="ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[c] }} />
)
