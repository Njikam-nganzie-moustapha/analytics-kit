// lz-string decompression — mirrors compress.ts in SDK
// Only called when X-Compressed: 1 header is present
type LZLib = { decompressFromEncodedURIComponent(s: string): string | null }
let _lz: LZLib | null = null

async function lz(): Promise<LZLib> {
  if (!_lz) {
    const mod = await import('lz-string')
    _lz = mod.default as unknown as LZLib
  }
  return _lz
}

export async function maybeDecompress(raw: string, compressed: boolean): Promise<string> {
  if (!compressed) return raw
  const lib = await lz()
  const result = lib.decompressFromEncodedURIComponent(raw)
  if (result === null) throw new Error('lz-string decompression returned null — payload corrupted')
  return result
}
