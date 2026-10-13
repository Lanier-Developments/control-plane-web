import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev the API is proxied, so the browser stays same-origin and no CORS config is needed.
// Point it elsewhere with VITE_PROXY_TARGET=http://host:port npm run dev
const target = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  // Relative asset paths, so the build works mounted at / or /ui or anywhere else.
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/ask': target,
      '/api': target,
      '/health': target,
    },
  },
})
