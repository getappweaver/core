import type { JSX } from 'solid-js';
import { createMemo, For, Show } from 'solid-js';

import { dependencyDetail } from '../statusRows';
import type { SetupStatus } from '../transport';

export function SystemCheckCard(props: { status: SetupStatus }): JSX.Element {
  const missingRequired = createMemo(
    () =>
      props.status.dependencies.filter((dep) => dep.required && !dep.installed)
        .length,
  );

  return (
    <section
      class="card setup-card setup-card--system"
      aria-labelledby="system-check-title"
    >
      <div class="setup-card-head">
        <div>
          <h1 id="system-check-title">System Check</h1>
        </div>
        <span
          class="setup-badge"
          classList={{ 'is-ok': missingRequired() === 0 }}
        >
          {missingRequired() === 0 ? 'ready' : `${missingRequired()} missing`}
        </span>
      </div>
      <p class="setup-copy">
        These checks read executables from this server process PATH. Optional
        tools can be configured later.
      </p>
      <ul class="setup-status-list setup-status-list--system">
        <For each={props.status.dependencies}>
          {(dependency) => (
            <li class="setup-status-row setup-status-row--system">
              <span
                class="setup-status-dot"
                classList={{
                  'is-ok': dependency.installed,
                  'is-missing': dependency.required && !dependency.installed,
                }}
                aria-hidden="true"
              />
              <span class="setup-status-label">
                {dependency.name}
                <small>{dependency.required ? 'required' : 'optional'}</small>
              </span>
              <span class="setup-status-detail">
                {dependencyDetail(dependency)}
              </span>
              <Show when={!dependency.installed}>
                <span class="setup-install-hint">
                  {dependency.installHint}{' '}
                  <Show when={dependency.installUrl}>
                    {(url) => (
                      <a href={url()} target="_blank" rel="noreferrer">
                        Open install guide
                      </a>
                    )}
                  </Show>
                  <Show when={dependency.installCommand}>
                    {(command) => <pre>{command()}</pre>}
                  </Show>
                </span>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
