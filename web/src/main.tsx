import { render } from 'solid-js/web';
import { registerSW } from 'virtual:pwa-register';

import 'highlight.js/styles/github-dark.css';

import { App } from './App';
import './styles.css';

registerSW({ immediate: true });

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element');
}

render(() => <App />, root);
