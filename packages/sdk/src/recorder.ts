import type { TrackerConfig, PushFn } from './types'

let _stop: (() => void) | null = null

export async function startRecorder(cfg: TrackerConfig, push: PushFn): Promise<void> {
  try {
    // Lazy-load rrweb — ne bloque jamais le chargement initial de la page
    const { record } = await import('rrweb')

    const stopFn = record({
      emit(event, isCheckout) {
        push({ type: 'rrweb_chunk', payload: event, checkout: isCheckout ?? false })
      },
      checkoutEveryNms: 10_000,
      blockClass: cfg.blockClass ?? 'ak-block',
      maskInputOptions: { password: true, email: false, tel: false, number: false, text: false },
      sampling: { mousemove: 50, mouseInteraction: true, scroll: 150, input: 'last' },
      recordCanvas: false,
      collectFonts: false,
    })
    // record() peut renvoyer undefined si rrweb ne peut pas s'initialiser
    if (stopFn !== undefined) _stop = stopFn
  } catch (err) {
    // rrweb non disponible (bundle non chargé) — dégradation silencieuse
    console.warn('[analytics-kit] recorder unavailable:', err)
  }
}

export function stopRecorder(): void {
  _stop?.()
  _stop = null
}
