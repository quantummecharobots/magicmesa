import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3002',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
})
