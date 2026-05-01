import { render } from 'solid-js/web';

import '../styles.css';

import { DemoShellApp } from './ShellApp';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element');
}

render(() => <DemoShellApp />, root);
