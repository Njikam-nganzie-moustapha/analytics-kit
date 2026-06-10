export interface Breadcrumb {
  t: number
  category: 'navigation' | 'click' | 'console' | 'http'
  message: string
  data?: Record<string, unknown>
}

const MAX = 25
const _crumbs: Breadcrumb[] = []

export function addBreadcrumb(crumb: Omit<Breadcrumb, 't'>): void {
  _crumbs.push({ t: Date.now(), ...crumb })
  if (_crumbs.length > MAX) _crumbs.shift()
}

export function getBreadcrumbs(): Breadcrumb[] {
  return [..._crumbs]
}

export function clearBreadcrumbs(): void {
  _crumbs.length = 0
}
