import { render } from 'solid-js/web';
import { registerSW } from 'virtual:pwa-register';

import 'highlight.js/styles/github-dark.css';

import { App } from './App';
import { installLifecycleDebugLogger, logLifecycle } from './debug/lifecycle';
import { isDemoScrollDebugEnabled } from './demo/runtime';
import { installDemoScrollDebugger } from './demo/scroll-debugger';
import './styles.css';

installLifecycleDebugLogger();

registerSW({
  immediate: true,
  onNeedRefresh() {
    logLifecycle('pwa.needRefresh');
  },
  onOfflineReady() {
    logLifecycle('pwa.offlineReady');
  },
  onRegisterError(error) {
    logLifecycle('pwa.registerError', {
      message: error instanceof Error ? error.message : String(error),
    });
  },
  onRegisteredSW(scriptUrl, registration) {
    logLifecycle('pwa.registered', {
      scriptUrl,
      active: registration?.active?.scriptURL ?? null,
      installing: registration?.installing?.scriptURL ?? null,
      waiting: registration?.waiting?.scriptURL ?? null,
    });
  },
});

if (isDemoScrollDebugEnabled()) {
  installDemoScrollDebugger();
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element');
}

render(() => <App />, root);
