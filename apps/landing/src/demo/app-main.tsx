import { render } from 'solid-js/web';

import 'highlight.js/styles/github-dark.css';
import '@web/src/styles.css';
import './demo.css';

import { emitStoryPassivePlaybackPausedChange } from '@web/src/story/events';

import { DemoApp } from './App';
import {
  installDemoStubs,
  setDemoSelectedStoryId,
  setDemoStoryPlaybackMode,
} from './stubs';

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
installDemoStubs();

if (typeof window !== 'undefined') {
  window.addEventListener('resize', syncAppViewportHeight);
  window.visualViewport?.addEventListener('resize', syncAppViewportHeight);
  window.visualViewport?.addEventListener('scroll', syncAppViewportHeight);
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element');
}

const url = new URL(window.location.href);
const initialStoryId = url.searchParams.get('story');
const initialStepIndex = Number.parseInt(
  url.searchParams.get('step') ?? '0',
  10,
);
const initialPlaybackMode =
  url.searchParams.get('playback') === 'passive' ? 'passive' : 'interactive';
setDemoStoryPlaybackMode(initialPlaybackMode);
setDemoSelectedStoryId(
  initialStoryId,
  Number.isFinite(initialStepIndex) ? initialStepIndex : 0,
);

let dispose = render(() => <DemoApp />, root);

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) {
    return;
  }

  const data = event.data as
    | {
        type?: string;
        storyId?: string | null;
        paused?: boolean;
        stepIndex?: number;
      }
    | null;

  if (data?.type === 'demo.set_playback_paused') {
    emitStoryPassivePlaybackPausedChange(data.paused === true);

    return;
  }

  if (
    !data ||
    (data.type !== 'demo.select_story' && data.type !== 'demo.play_story')
  ) {
    return;
  }

  setDemoStoryPlaybackMode(
    data.type === 'demo.play_story' ? 'passive' : 'interactive',
  );
  setDemoSelectedStoryId(data.storyId ?? null, data.stepIndex ?? 0);
  dispose();
  dispose = render(() => <DemoApp />, root);
});
