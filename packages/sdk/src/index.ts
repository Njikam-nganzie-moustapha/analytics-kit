import { init, identify, setUser, setRelease, track, startTransaction, destroy } from './tracker'
import { addBreadcrumb } from './breadcrumbs'
import type { TrackerConfig, ZoneDef, AnalyticsEvent, UserContext } from './types'

const Tracker = { init, identify, setUser, setRelease, track, startTransaction, destroy, addBreadcrumb }

// Expose as global for <script> tag (UMD)
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>)['Tracker'] = Tracker
}

export default Tracker
export { init, identify, setUser, setRelease, track, startTransaction, destroy, addBreadcrumb }
export type { TrackerConfig, ZoneDef, AnalyticsEvent, UserContext }
