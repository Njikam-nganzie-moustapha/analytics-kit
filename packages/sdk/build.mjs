import * as esbuild from 'esbuild'

const isWatch = process.argv.includes('--watch')
const isDev = process.argv.includes('--dev')

const sharedConfig = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  sourcemap: true,
  target: ['es2018', 'chrome80', 'firefox80', 'safari14'],
  define: { 'process.env.NODE_ENV': isDev ? '"development"' : '"production"' },
  // rrweb chargé en lazy import séparé (CDN ou bundler) — ne pas l'inclure ici
  // lz-string inclus dans le bundle UMD pour zéro dépendance CDN
  external: ['rrweb'],
}

async function build() {
  // UMD — injectable via <script src="tracker.min.js">
  // rrweb optionnel : si absent, replay désactivé silencieusement
  await esbuild.build({
    ...sharedConfig,
    format: 'iife',
    globalName: 'Tracker',
    minify: !isDev,
    outfile: 'dist/tracker.min.js',
    footer: { js: '/* analytics-kit v0.1.0 */' },
  })

  // ESM — pour bundlers (Vite, Webpack, etc.)
  await esbuild.build({
    ...sharedConfig,
    format: 'esm',
    minify: false,
    outfile: 'dist/tracker.esm.js',
    external: ['rrweb', 'lz-string'],
  })

  // Taille finale
  const { default: fs } = await import('fs')
  const stat = fs.statSync('dist/tracker.min.js')
  console.log(`[build] tracker.min.js → ${(stat.size / 1024).toFixed(1)} KB`)
  console.log('[build] done')
}

if (isWatch) {
  const ctx = await esbuild.context({ ...sharedConfig, format: 'iife', outfile: 'dist/tracker.min.js' })
  await ctx.watch()
  console.log('[watch] watching src/...')
} else {
  await build()
}
