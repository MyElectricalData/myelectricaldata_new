/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_APP_NAME: string
  readonly VITE_TURNSTILE_SITE_KEY: string
  readonly VITE_DEBUG: string
  readonly VITE_SERVER_MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Global constants injected by Vite at build time
declare const __APP_VERSION__: string
