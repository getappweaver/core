import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'dm-bot web',
        short_name: 'dm-bot',
        description: 'dm-bot command and chat UI',
        theme_color: '#121218',
        background_color: '#121218',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
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
    host: '127.0.0.1',
    port: 5552,
    allowedHosts: ['dm-bot.nostrize.me'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5551',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:5551',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
