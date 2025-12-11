import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    watch: {
      usePolling: true,
      interval: 1000,
    },
    hmr: {
      clientPort: 8083,
    },
    proxy: {
      '/api': {
        target: 'http://local-client:8080',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://local-client:8080',
        changeOrigin: true,
      },
    },
  },
})
