import { init, identify, track, destroy } from './tracker'
import type { TrackerConfig, ZoneDef, AnalyticsEvent } from './types'

// API publique du SDK
const Tracker = { init, identify, track, destroy }

// Expose en global pour les <script> tags (UMD build)
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>)['Tracker'] = Tracker
}

export default Tracker
export { init, identify, track, destroy }
export type { TrackerConfig, ZoneDef, AnalyticsEvent }
