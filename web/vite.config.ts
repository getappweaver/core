import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import solid from 'vite-plugin-solid';

const devHost = process.env.BOT_WEB_HOST?.trim() || '127.0.0.1';
const devPort = Number.parseInt(process.env.BOT_WEB_UI_PORT ?? '5552', 10);
const backendHostRaw = process.env.BOT_WEB_HOST?.trim() || '127.0.0.1';
const backendHost =
  backendHostRaw === '0.0.0.0' || backendHostRaw === '::'
    ? '127.0.0.1'
    : backendHostRaw;
const backendPort = Number.parseInt(process.env.BOT_WEB_PORT ?? '5551', 10);
const backendPortSafe = Number.isNaN(backendPort) ? 5551 : backendPort;
const backendHttpOrigin = `http://${backendHost}:${backendPortSafe}`;
const backendWsOrigin = `ws://${backendHost}:${backendPortSafe}`;
const setupOnlyMode = ['BOT_KEY', 'BOT_MASTER_PUBKEY', 'BOT_RELAYS'].some(
  (name) => (process.env[name]?.trim() ?? '').length === 0,
);

export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        id: '/',
        name: 'AppWeaver',
        short_name: 'AppWeaver',
        description: 'AppWeaver command and chat UI',
        theme_color: '#121218',
        background_color: '#121218',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'appweaver-pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'appweaver-pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    dedupe: ['solid-js', 'solid-js/web'],
  },
  root: import.meta.dirname,
  server: {
    host: devHost,
    port: Number.isNaN(devPort) ? 5552 : devPort,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: backendHttpOrigin,
        changeOrigin: true,
      },
      ...(setupOnlyMode
        ? {}
        : {
            '/ws': {
              target: backendWsOrigin,
              ws: true,
              changeOrigin: true,
            },
          }),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
