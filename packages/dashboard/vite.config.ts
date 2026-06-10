import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4212,
    proxy: {
      '/api': { target: 'http://localhost:4211', rewrite: path => path.replace(/^\/api/, '') },
      '/e':   { target: 'http://localhost:4210' },
    },
  },
  preview: { port: 4213 },
})
