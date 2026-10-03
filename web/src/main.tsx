import { render } from 'solid-js/web';

import 'highlight.js/styles/github-dark.css';

import { App } from './App';
import { installLifecycleDebugLogger } from './debug/lifecycle';
import { isDemoScrollDebugEnabled } from './demo/runtime';
import { installDemoScrollDebugger } from './demo/scroll-debugger';
import { registerPwaUpdates } from './pwaUpdates';
import './styles.css';

installLifecycleDebugLogger();

registerPwaUpdates();

if (isDemoScrollDebugEnabled()) {
  installDemoScrollDebugger();
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element');
}

render(() => <App />, root);
