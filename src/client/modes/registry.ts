import type { ClientMode } from '../mode.ts'
import { inbetween } from './inbetween/index.ts'

// Add a mode: import it and list it here.
export const clientModes: ClientMode[] = [inbetween]
