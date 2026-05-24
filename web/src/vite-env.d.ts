/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
interface ImportMetaEnv {
  readonly VITE_APPWEAVER_DEMO: boolean;
  readonly VITE_APPWEAVER_DEMO_EMBEDDED: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
