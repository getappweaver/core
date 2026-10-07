import { For, Show } from 'solid-js';

import type { OfficialApp } from './landing-data';
import { officialApps } from './landing-data';

type OfficialAppGridProps = {
  apps: OfficialApp[];
};

export function pluginIconSrcForSlug(slug: string): string | null {
  return officialApps.find((app) => app.href.slice(1) === slug || app.alias === slug)?.iconSrc ?? null;
}

export function OfficialAppGrid(props: OfficialAppGridProps) {
  return (
    <div class="official-app-grid">
      <For each={props.apps}>
        {(app) => (
          <article class="official-app-card">
            <a class="official-app-card-heading" href={app.href}>
              <Show when={pluginIconSrcForSlug(app.href.slice(1))}>
                {(iconSrc) => (
                  <img
                    class="official-app-icon"
                    src={iconSrc()}
                    alt=""
                    aria-hidden="true"
                  />
                )}
              </Show>
              <span class="official-app-heading-copy">
                <span class="official-app-label">{app.label}</span>
                <span class="official-app-name">{app.name}</span>
              </span>
            </a>
            <p class="official-app-description">{app.description}</p>
            <Show when={app.hasInteractiveDemo}>
              <a class="official-app-link" href={app.href}>
                Interactive Demo
              </a>
            </Show>
          </article>
        )}
      </For>
    </div>
  );
}
