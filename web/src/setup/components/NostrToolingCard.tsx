import type { JSX } from 'solid-js';
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js';

import {
  detectBrowserEnvironment,
  nostrToolRecommendations,
} from '../browserEnvironment';

export function NostrToolingCard(): JSX.Element {
  const [environment, setEnvironment] = createSignal(
    detectBrowserEnvironment(),
  );

  const recommendations = createMemo(() =>
    nostrToolRecommendations(environment()),
  );

  const refreshEnvironment = () => setEnvironment(detectBrowserEnvironment());
  const refreshTimer = window.setTimeout(refreshEnvironment, 900);

  window.addEventListener('focus', refreshEnvironment);
  document.addEventListener('visibilitychange', refreshEnvironment);

  onCleanup(() => {
    window.clearTimeout(refreshTimer);
    window.removeEventListener('focus', refreshEnvironment);
    document.removeEventListener('visibilitychange', refreshEnvironment);
  });

  return (
    <section
      class="card setup-card setup-card--nostr-tools"
      aria-labelledby="nostr-tooling-title"
    >
      <div class="setup-card-head">
        <div>
          <h1 id="nostr-tooling-title">Nostr tooling</h1>
        </div>
        <span
          class="setup-badge"
          classList={{ 'is-ok': environment().nip07Available }}
        >
          {environment().nip07Available ? 'signer found' : 'recommendation'}
        </span>
      </div>
      <p class="setup-copy">
        AppWeaver detected this browser environment and picked the best connect
        options for setup.
      </p>
      <dl class="setup-detection-grid">
        <div>
          <dt>Browser</dt>
          <dd>{environment().browser}</dd>
        </div>
        <div>
          <dt>Device</dt>
          <dd>{environment().device}</dd>
        </div>
        <div>
          <dt>OS</dt>
          <dd>{environment().os}</dd>
        </div>
        <div>
          <dt>NIP-07</dt>
          <dd>{environment().nip07Available ? 'available' : 'not detected'}</dd>
        </div>
      </dl>
      <ul class="setup-tool-list">
        <For each={recommendations()}>
          {(recommendation) => (
            <li>
              <strong>{recommendation.name}</strong>
              <span>{recommendation.detail}</span>
              <Show when={recommendation.href}>
                {(href) => (
                  <a href={href()} target="_blank" rel="noreferrer">
                    Open
                  </a>
                )}
              </Show>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
