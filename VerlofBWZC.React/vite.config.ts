import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Lokaal: http://localhost:7446 (naast de Blazor-website op 7246). API-oproepen (/api/...) gaan via de
// dev-server naar de API van Aspire (https://localhost:7080), zodat de API geen extra CORS-origin nodig heeft.
// In productie komt het API-adres uit VITE_API_BASE_ADDRESS (.env.production).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 7446,
    strictPort: true,
    proxy: {
      '/api': { target: process.env.API_TARGET ?? 'https://localhost:7080', changeOrigin: true, secure: false },
    },
  },
  preview: { port: 7447, strictPort: true },
})
