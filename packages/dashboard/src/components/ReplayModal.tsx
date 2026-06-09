import { useEffect, useRef, useState, useCallback } from 'react'
import { Replayer } from 'rrweb'

interface Props {
  sid: string
  events: unknown[]
  loading?: boolean
  onClose: () => void
}

type ReplayerLike = {
  play(offset?: number): void
  pause(offset?: number): void
  setConfig(c: { speed: number }): void
  getMetaData(): { totalTime: number }
  on(ev: string, fn: () => void): void
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function ReplayModal({ sid, events, loading = false, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const replayerRef  = useRef<ReplayerLike | null>(null)
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  // Wall-clock tracking avoids any rrweb internal API dependency
  const clockRef     = useRef({ startOffset: 0, startWall: 0, speed: 1 })

  const [playing, setPlaying] = useState(false)
  const [speed,   setSpeed]   = useState(1)
  const [current, setCurrent] = useState(0)
  const [total,   setTotal]   = useState(0)
  const [ready,   setReady]   = useState(false)

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  const startTimer = useCallback((tot: number) => {
    stopTimer()
    timerRef.current = setInterval(() => {
      const { startOffset, startWall, speed: s } = clockRef.current
      const t = Math.min(startOffset + (performance.now() - startWall) * s, tot)
      setCurrent(t)
      if (t >= tot - 100) {
        stopTimer()
        setPlaying(false)
      }
    }, 200)
  }, [stopTimer])

  const scaleIframe = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const iframe = container.querySelector('iframe') as HTMLIFrameElement | null
    if (!iframe) return
    const iW = parseFloat(iframe.style.width)  || 1280
    const iH = parseFloat(iframe.style.height) || 720
    const cW = container.clientWidth
    if (cW <= 0) return
    const scale = cW / iW
    iframe.style.transform       = `scale(${scale})`
    iframe.style.transformOrigin = 'top left'
    container.style.height       = `${Math.round(iH * scale)}px`
  }, [])

  // Init replayer when events arrive
  useEffect(() => {
    if (events.length === 0 || !containerRef.current) return
    let cancelled = false

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = new Replayer(events as any, {
      root:      containerRef.current,
      speed:     1,
      mouseTail: false,
    }) as ReplayerLike

    if (cancelled) { r.pause(); return }

    replayerRef.current = r
    const meta = r.getMetaData()
    setTotal(meta.totalTime)
    setReady(true)

    r.on('finish', () => { stopTimer(); setPlaying(false); setCurrent(meta.totalTime) })

    setTimeout(scaleIframe, 80)

    return () => { cancelled = true; stopTimer(); r.pause() }
  }, [events, scaleIframe, stopTimer])

  useEffect(() => {
    window.addEventListener('resize', scaleIframe)
    return () => window.removeEventListener('resize', scaleIframe)
  }, [scaleIframe])

  const play = useCallback((offset?: number) => {
    const r = replayerRef.current
    if (!r) return
    const from = offset ?? current
    r.play(from)
    clockRef.current = { startOffset: from, startWall: performance.now(), speed }
    setPlaying(true)
    startTimer(total)
  }, [current, speed, total, startTimer])

  const pause = useCallback(() => {
    replayerRef.current?.pause()
    stopTimer()
    setPlaying(false)
  }, [stopTimer])

  const seek = useCallback((ms: number) => {
    setCurrent(ms)
    clockRef.current.startOffset = ms
    if (playing) {
      replayerRef.current?.play(ms)
      clockRef.current.startWall = performance.now()
    } else {
      replayerRef.current?.pause(ms)
    }
  }, [playing])

  const changeSpeed = useCallback((s: number) => {
    setSpeed(s)
    replayerRef.current?.setConfig({ speed: s })
    if (playing) {
      clockRef.current = { startOffset: current, startWall: performance.now(), speed: s }
    } else {
      clockRef.current.speed = s
    }
  }, [playing, current])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')      onClose()
      if (e.key === ' ' && ready)  { e.preventDefault(); playing ? pause() : play() }
      if (e.key === 'ArrowRight')  seek(Math.min(current + 5000, total))
      if (e.key === 'ArrowLeft')   seek(Math.max(current - 5000, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready, playing, play, pause, seek, current, total, onClose])

  return (
    <div
      className="replay-backdrop"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="replay-modal">
        {/* Header */}
        <div className="replay-header">
          <span className="replay-sid">
            Session replay — <code>{sid.slice(0, 20)}{sid.length > 20 ? '…' : ''}</code>
            {ready && <span style={{ marginLeft: 12, color: 'var(--muted)', fontSize: 12 }}>{events.length.toLocaleString()} events</span>}
          </span>
          <div className="replay-speed-btns">
            {[0.5, 1, 2, 4].map(s => (
              <button key={s} className={`speed-btn ${speed === s ? 'active' : ''}`} onClick={() => changeSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <button className="replay-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Player */}
        <div className="replay-player-area">
          {loading && <div className="loading">Fetching events…</div>}
          {!loading && events.length === 0 && <div className="empty">No replay events for this session.</div>}
          <div ref={containerRef} className="replay-container" />
        </div>

        {/* Controls */}
        {ready && (
          <div className="replay-controls">
            <button
              className="play-pause-btn"
              onClick={playing ? pause : () => play()}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? '⏸' : '▶'}
            </button>
            <input
              type="range" min={0} max={total} value={current} step={200}
              className="replay-scrubber"
              onChange={e => seek(parseInt(e.target.value))}
            />
            <span className="replay-time">{fmtTime(current)} / {fmtTime(total)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
