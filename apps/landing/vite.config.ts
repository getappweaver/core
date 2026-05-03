import { resolve } from 'path';

import { defineConfig, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';

function trailingSlashRedirectPlugin(): Plugin {
  const redirects = new Map([
    ['/demo', '/demo/'],
    ['/demo/app', '/demo/app/'],
  ]);

  return {
    name: 'landing-demo-trailing-slash-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : null;
        const target = url ? redirects.get(url) : null;

        if (!target) {
          next();
          return;
        }

        res.statusCode = 302;
        res.setHeader('Location', target);
        res.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [trailingSlashRedirectPlugin(), solid(), tailwindcss()],
  resolve: {
    alias: {
      '@src': resolve(import.meta.dirname, '../../src'),
      '@web': resolve(import.meta.dirname, '../../web'),
      '@plugins': resolve(import.meta.dirname, '../../plugins'),
    },
    dedupe: ['solid-js', 'solid-js/web'],
  },
  server: {
    host: process.env.LANDING_HOST?.trim() || '127.0.0.1',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        demo: resolve(import.meta.dirname, 'demo/index.html'),
        demoApp: resolve(import.meta.dirname, 'demo/app/index.html'),
      },
    },
  },
});
