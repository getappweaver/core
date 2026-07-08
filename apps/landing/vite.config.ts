import { resolve } from 'path';

import { defineConfig, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';

type LandingRouteRequestProps = {
  req: { url?: string };
  res: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: () => void;
  };
  next: () => void;
};

function landingRoutesPlugin(): Plugin {
  const redirects = new Map([['/demo/app', '/demo/app/']]);
  const appRoutes = new Set([
    '/apps/bookmark-manager',
    '/apps/captains-log',
    '/apps/file-manager',
    '/apps/job-scheduler',
    '/apps/nostr-radar',
    '/apps/todo',
    '/one-page',
  ]);

  function handleRequest({ req, res, next }: LandingRouteRequestProps): void {
    const url = req.url ? req.url.split('?')[0] : null;
    const target = url ? redirects.get(url) : null;

    if (target) {
      res.statusCode = 302;
      res.setHeader('Location', target);
      res.end();

      return;
    }

    if (url === '/blog') {
      res.statusCode = 302;
      res.setHeader('Location', '/blog/');
      res.end();

      return;
    }

    if (url?.startsWith('/blog/') && !url.split('/').at(-1)?.includes('.')) {
      req.url = url.endsWith('/') ? `${url}index.html` : `${url}/index.html`;
    }

    if (url && appRoutes.has(url)) {
      req.url = '/index.html';
    }

    next();
  }

  return {
    name: 'landing-routes',
    configureServer(server) {
      server.middlewares.use((req, res, next) =>
        handleRequest({ req, res, next }),
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) =>
        handleRequest({ req, res, next }),
      );
    },
  };
}

export default defineConfig({
  plugins: [landingRoutesPlugin(), solid(), tailwindcss()],
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
      },
    },
  },
});
