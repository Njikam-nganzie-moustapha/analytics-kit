import type { PushFn } from './types'
import { absPos, getSelector } from './utils'

const RAGE_COUNT = 3       // clicks pour déclencher rage
const RAGE_WINDOW = 1000   // ms
const DEAD_DELAY = 600     // ms pour détecter click mort

interface ClickRecord {
  target: Element
  time: number
}

let history: ClickRecord[] = []

export function startRageTracking(push: PushFn): void {
  document.addEventListener('click', (e) => {
    const target = e.target as Element
    const now = Date.now()
    const pos = absPos(e)

    // Nettoyer les clics hors de la fenêtre temporelle
    history = history.filter(c => now - c.time < RAGE_WINDOW)
    history.push({ target, time: now })

    // Rage click : même cible (ou parent proche) N fois dans la fenêtre
    const onSame = history.filter(c =>
      c.target === target ||
      c.target.contains(target) ||
      target.contains(c.target)
    )
    if (onSame.length >= RAGE_COUNT) {
      push({
        type: 'rage_click',
        ...pos,
        target: getSelector(target),
        count: onSame.length,
      })
      history = []  // reset — évite de spammer plusieurs rage events
      return
    }

    // Dead click : click sur élément pointer-cursor mais DOM ne change pas
    const snapshot = target.outerHTML
    const isInteractiveLooking =
      getComputedStyle(target).cursor === 'pointer' ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'A' ||
      target.getAttribute('role') === 'button'

    if (isInteractiveLooking) {
      setTimeout(() => {
        // Si le DOM autour n'a pas changé après le clic → clic mort
        if (target.isConnected && target.outerHTML === snapshot) {
          push({
            type: 'dead_click',
            ...pos,
            target: getSelector(target),
          })
        }
      }, DEAD_DELAY)
    }
  })
}
