import { render } from 'solid-js/web';
import { registerSW } from 'virtual:pwa-register';

import 'highlight.js/styles/github-dark.css';

import { App } from './App';
import './styles.css';

registerSW({ immediate: true });

function syncAppViewportHeight(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

  document.documentElement.style.setProperty(
    '--app-viewport-height',
    `${Math.round(viewportHeight)}px`,
  );
}

syncAppViewportHeight();

if (typeof window !== 'undefined') {
  window.addEventListener('resize', syncAppViewportHeight);
  window.visualViewport?.addEventListener('resize', syncAppViewportHeight);
  window.visualViewport?.addEventListener('scroll', syncAppViewportHeight);
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element');
}

render(() => <App />, root);
