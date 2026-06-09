export function generateId(prefix = 'sx'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`
}

// Renvoie un sélecteur CSS court et lisible pour un élément
export function getSelector(el: Element | null): string {
  if (!el || el === document.body) return 'body'
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ''
  const cls = Array.from(el.classList)
    .filter(c => !c.match(/^(js-|is-|has-)/))
    .slice(0, 2)
    .map(c => `.${c}`)
    .join('')
  return `${tag}${id}${cls}`.slice(0, 60)
}

// Position absolue (inclut scrollY) depuis un MouseEvent
export function absPos(e: MouseEvent): { x: number; y: number } {
  return {
    x: Math.round(e.clientX),
    y: Math.round(e.clientY + window.scrollY),
  }
}

// Dimensions viewport + scroll
export function viewport() {
  return {
    vw: window.innerWidth,
    vh: window.innerHeight,
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
  }
}

// Debounce léger (évite floods sur resize/scroll)
export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: unknown[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}
