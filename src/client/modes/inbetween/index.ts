import { meta, metres } from '../../../shared/modes/inbetween.ts'
import type { ClientMode } from '../../mode.ts'
import { Play } from './Play.tsx'
import { Rules } from './Rules.tsx'

export const inbetween: ClientMode = { meta, Play, Rules, formatScore: (cm) => `${metres(cm)} m` }
