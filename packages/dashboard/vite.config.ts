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
  server: {
    port: 4212,
    proxy: {
      '/api': { target: 'http://localhost:4211', rewrite: path => path.replace(/^\/api/, '') },
      '/e':   { target: 'http://localhost:4210' },
    },
  },
  preview: { port: 4213 },
  build: {
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
