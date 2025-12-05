import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    build: {
      // Target modern browsers for smaller output
      target: 'es2020',
      // Enable minification with esbuild (faster than terser)
      minify: 'esbuild',
      // Reduce source map generation time in production
      sourcemap: false,
      // Chunk splitting for better caching
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks: {
            // Core vendor - all node_modules except heavy lazy-loaded ones
            // Using object syntax prevents circular dependency issues
            vendor: [
              'react',
              'react-dom',
              'react-router-dom',
              '@headlessui/react',
              '@tanstack/react-query',
              'axios',
              'zustand',
              'lucide-react',
              'clsx',
            ],
            // Charts - lazy loaded on dashboard/consumption pages
            charts: ['recharts'],
            // PDF generation - lazy loaded
            pdf: ['jspdf', 'html2canvas'],
          },
        },
      },
    },
    // Optimize dependency pre-bundling
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@tanstack/react-query',
        'axios',
        'zustand',
        'lucide-react',
        'recharts',
      ],
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      watch: {
        usePolling: true,
        interval: 1000,
      },
      hmr: {
        clientPort: 8000,
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})
