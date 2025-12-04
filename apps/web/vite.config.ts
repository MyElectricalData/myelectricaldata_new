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
          manualChunks(id) {
            // Core React - loaded on every page
            if (id.includes('node_modules/react/') ||
                id.includes('node_modules/react-dom/') ||
                id.includes('node_modules/react-router-dom/')) {
              return 'react-vendor';
            }
            // UI components - loaded on most pages
            if (id.includes('lucide-react') ||
                id.includes('@headlessui/react') ||
                id.includes('clsx')) {
              return 'ui-vendor';
            }
            // Charts - only on dashboard/consumption pages
            if (id.includes('recharts')) {
              return 'chart-vendor';
            }
            // Data fetching - loaded on most pages
            if (id.includes('@tanstack/react-query') ||
                id.includes('axios') ||
                id.includes('zustand')) {
              return 'query-vendor';
            }
            // Heavy dependencies - lazy loaded
            if (id.includes('swagger-ui-react')) {
              return 'swagger-ui';
            }
            if (id.includes('jspdf') || id.includes('html2canvas')) {
              return 'pdf-vendor';
            }
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
