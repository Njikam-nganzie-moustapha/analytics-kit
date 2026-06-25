import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Strip console.log + debugger statements from the production bundle.
  // legalComments: 'none' prevents lib names from leaking via license banners.
  esbuild: {
    drop: ['console', 'debugger'],
    legalComments: 'none',
  },
  server: {
    port: 4212,
    proxy: {
      '/api': { target: 'http://localhost:4211', rewrite: path => path.replace(/^\/api/, '') },
      '/e':   { target: 'http://localhost:4210' },
    },
  },
  preview: { port: 4213 },
  build: {
    // Explicit: no .map files shipped to Vercel — minified bundle is the only artifact.
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          recharts: ['recharts'],
          rrweb: ['rrweb'],
          motion: ['framer-motion'],
        },
      },
    },
  },
})
