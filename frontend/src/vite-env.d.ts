/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the calculator API; empty or unset means the page's own origin. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
