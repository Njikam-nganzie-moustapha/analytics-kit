// Minimal source-map consumer — pure TypeScript, zero deps.
// Supports standard v3 source maps produced by Webpack/Vite/esbuild.

interface RawSourceMap {
  version:         number
  sources:         string[]
  sourcesContent?: (string | null)[]
  mappings:        string
  names?:          string[]
}

interface Mapping {
  gl: number   // generated line   (0-based)
  gc: number   // generated column (0-based)
  si: number   // source index
  sl: number   // source line      (0-based)
  sc: number   // source column    (0-based)
}

// ── VLQ decoder ───────────────────────────────────────────────────────────────
const B64 = new Uint8Array(256).fill(255)
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  .split('').forEach((c, i) => { B64[c.charCodeAt(0)] = i })

function vlqAt(s: string, i: number): [value: number, next: number] {
  let result = 0, shift = 0, digit: number
  do {
    digit = B64[s.charCodeAt(i++)]
    if (digit === 255) break
    result |= (digit & 0x1f) << shift
    shift  += 5
  } while (digit & 0x20)
  return [result & 1 ? -(result >>> 1) : result >>> 1, i]
}

// ── Mapping parser ────────────────────────────────────────────────────────────
function parseMappings(raw: string): Mapping[] {
  const out: Mapping[] = []
  let gl = 0, gc = 0, si = 0, sl = 0, sc = 0
  let p  = 0
  const n = raw.length

  while (p <= n) {
    const ch = p < n ? raw.charCodeAt(p) : 59 /* ; */

    if (ch === 59 /* ; */) { gl++; gc = 0; p++; continue }
    if (ch === 44 /* , */) { p++;          continue }
    if (p === n)           break

    // generated column (always present)
    let dgc: number; [dgc, p] = vlqAt(raw, p); gc += dgc

    if (p >= n || raw.charCodeAt(p) === 44 || raw.charCodeAt(p) === 59) {
      // segment with no source info
      continue
    }

    let dsi: number; [dsi, p] = vlqAt(raw, p); si += dsi
    let dsl: number; [dsl, p] = vlqAt(raw, p); sl += dsl
    let dsc: number; [dsc, p] = vlqAt(raw, p); sc += dsc

    out.push({ gl, gc, si, sl, sc })

    // optional names entry
    if (p < n && raw.charCodeAt(p) !== 44 && raw.charCodeAt(p) !== 59) {
      [, p] = vlqAt(raw, p)
    }
  }

  // Sort for binary-search lookups
  out.sort((a, b) => a.gl !== b.gl ? a.gl - b.gl : a.gc - b.gc)
  return out
}

// ── Lookup ────────────────────────────────────────────────────────────────────
function findMapping(mappings: Mapping[], line: number, col: number): Mapping | null {
  // Find the last entry with (gl <= line) and (gc <= col)
  let lo = 0, hi = mappings.length - 1, best: Mapping | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const m   = mappings[mid]
    if (m.gl < line || (m.gl === line && m.gc <= col)) {
      if (m.gl === line) best = m
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SourceMapConsumer {
  originalPositionFor(line: number, col: number): {
    source: string | null
    line: number | null
    column: number | null
    snippet: string | null
  }
}

export function createConsumer(json: string): SourceMapConsumer | null {
  try {
    const sm = JSON.parse(json) as RawSourceMap
    if (sm.version !== 3 || !sm.mappings) return null
    const mappings = parseMappings(sm.mappings)
    return {
      originalPositionFor(line: number, col: number) {
        const m = findMapping(mappings, line - 1, col)
        if (!m || m.si < 0) return { source: null, line: null, column: null, snippet: null }
        const source  = sm.sources[m.si] ?? null
        const srcLine = m.sl + 1
        const srcCol  = m.sc
        const snippet = sm.sourcesContent?.[m.si]
          ? extractLine(sm.sourcesContent[m.si]!, m.sl)
          : null
        return { source, line: srcLine, column: srcCol, snippet }
      },
    }
  } catch {
    return null
  }
}

function extractLine(content: string, line: number): string | null {
  const lines = content.split('\n')
  return lines[line]?.trim().slice(0, 200) ?? null
}

// ── Stack trace symbolication ─────────────────────────────────────────────────

const FRAME_RE = /at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/g

export interface SymbolicatedFrame {
  fn:      string | null
  source:  string | null
  line:    number | null
  column:  number | null
  snippet: string | null
}

export function symbolicateStack(
  stack: string,
  consumers: Map<string, SourceMapConsumer>,
): SymbolicatedFrame[] {
  const frames: SymbolicatedFrame[] = []
  FRAME_RE.lastIndex = 0

  let m: RegExpExecArray | null
  while ((m = FRAME_RE.exec(stack)) !== null) {
    const fn  = m[1] ?? null
    const file = m[2]
    const line = parseInt(m[3])
    const col  = parseInt(m[4])

    // Find matching consumer by filename suffix
    const consumer = findConsumer(consumers, file)
    if (consumer) {
      const orig = consumer.originalPositionFor(line, col)
      frames.push({ fn, source: orig.source, line: orig.line, column: orig.column, snippet: orig.snippet })
    } else {
      frames.push({ fn, source: file, line, column: col, snippet: null })
    }
  }

  return frames
}

function findConsumer(map: Map<string, SourceMapConsumer>, file: string): SourceMapConsumer | null {
  // Exact match
  if (map.has(file)) return map.get(file)!
  // Suffix match (handles absolute vs relative paths)
  for (const [key, consumer] of map) {
    if (file.endsWith(key) || key.endsWith(file)) return consumer
    // Match just the filename
    const keyBase  = key.split('/').pop()  ?? key
    const fileBase = file.split('/').pop() ?? file
    if (keyBase === fileBase) return consumer
  }
  return null
}
