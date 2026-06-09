// Compression LZ-String — sync, ~3KB, fonctionne partout (pas de WASM)
// lz-string est la seule dep externe du SDK

import LZString from 'lz-string'

// Compresse une string JSON → string URI-safe (ASCII, envoyable en body)
export function compressStr(input: string): string {
  return LZString.compressToEncodedURIComponent(input)
}

export function decompressStr(input: string): string {
  return LZString.decompressFromEncodedURIComponent(input) ?? input
}

// Ratio approximatif de compression (pour debug/stats)
export function compressionRatio(original: string, compressed: string): number {
  if (!original.length) return 1
  return Math.round((1 - compressed.length / original.length) * 100)
}
